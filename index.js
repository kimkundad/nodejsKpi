// index.js
const express = require('express');
const Arena = require('bull-arena');
const { Queue } = require('bullmq');
const jobQueue = require('./queue');
const { createClient } = require('redis');
const { sql, poolPromise } = require('./dbPool');
const mysql = require('mysql2/promise');
require('dotenv').config();

const connectionMysql = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});


const app = express();
const port = 3000;

app.use(express.json());

const addJob = async (jobData) => {
  await jobQueue.add('job', jobData);
  console.log('Job added to the queue:', jobData);
};

const addJobrecomment = async (jobData) => {
  console.log('Job added Recomment:', jobData);
  await jobQueue.add('Recomment', jobData);
};

const addJobTop = async (jobData) => {
  console.log('Job added Top Book:', jobData);
  await jobQueue.add('TopBook', jobData);
};

// Bull-Arena configuration
const arenaConfig = Arena(
  {
    BullMQ: Queue,
    queues: [
      {
        type: 'bullmq',
        name: 'jobQueue',
        hostId: 'Worker',
        connection: {
          host: '127.0.0.1',
          port: 6379,
        },
      },
    ],
  },
  {
    basePath: '/',
    disableListen: true,
  }
);

// Use Arena as middleware
app.use('/arena', arenaConfig);

// ตรวจสอบการเชื่อมต่อ Redis
const redisClient = createClient({ url: 'redis://127.0.0.1:6379' });

redisClient.on('error', (err) => console.error('Redis Client Error', err));
redisClient.on('connect', () => console.log('Connected to Redis'));

redisClient.connect();


// Get all EEtc with pagination
app.get('/data', async (req, res) => {
  try {
    const { page = 1, pageSize = 10 } = req.query; // Default values: page=1, pageSize=10
  const offset = (page - 1) * pageSize;
  
  const pool = await poolPromise;

  //get count 

  const getCount = await pool.request()
    .query(`
      SELECT COUNT(*) OVER () AS TotalRows
      FROM EBib
        JOIN EEtcBib ON EBib.BibId = EEtcBib.EBBibId
        WHERE EEtcBib.EBTag = 245 OR EEtcBib.EBTag = 246
    `);
  console.log('getCount', getCount.rowsAffected[0])

  const maxNum = getCount.rowsAffected[0];
  let allResults = [];

  for (let startNum = 1; startNum <= maxNum; startNum++) {

  const result = await pool.request()
    .input('pageSize', sql.Int, 1)
    .input('offset', sql.Int, startNum)
    .query(`
      WITH PaginatedData AS (
        SELECT
          EBib.BibId AS mainID,
          EBib.EntrDate AS EntrDate,
          EBib.CalRaw AS CallNumber,
          EEtc.EtcRaw AS bookName,
          EEtcBib.EBTag AS EBTag,
          EEtcBib.EBInd AS EBInd,
          EEtc.EtcCnt as EtcCnt,
          EEtcBib.EBEtcId as EBEtcId,
          ENte.NteRaw AS Book_Content,
          ECvr.CvrFilename AS CvrFilename,
          ROW_NUMBER() OVER (ORDER BY EBib.EntrDate DESC) AS RowNum
        FROM EBib
        JOIN EEtcBib ON EBib.BibId = EEtcBib.EBBibId
        JOIN EEtc ON EEtcBib.EBEtcId = EEtc.EtcId
        JOIN ENte ON EEtcBib.EBBibId = ENte.NteBibId
        JOIN ECvr ON EEtcBib.EBBibId = ECvr.CvrBibId
        WHERE ENte.NteTag = 505 OR ENte.NteTag = 500
      )
      SELECT mainID, CallNumber, bookName, EBTag, EBInd, Book_Content, CvrFilename, EtcCnt, EBEtcId, EntrDate
      FROM PaginatedData
      WHERE RowNum > @offset AND RowNum <= (@offset + @pageSize);
    `);

    if (result.recordset.length > 0) {
      allResults = allResults.concat(result.recordset);
      await addJob(result.recordset);
    }

   //}
   //856 ebook
        //WHERE EBib.BibId = 31498 AND EEtcBib.EBTag = 245;
    // try {
    //   await insertData(result.recordset);
    //   res.status(200).send('Data inserted successfully');
    // } catch (error) {
    //   console.error('Error inserting data:', error);
    //   res.status(500).send('Error inserting data');
     }

     res.json(allResults);

  } catch (err) {
    console.error('Error executing query:', err);
    res.status(500).send('Error retrieving data');
  }
});


app.get('/Addrecomment', async (req, res) => {

  const pool = await poolPromise;
  const result = await pool.request()
    .query(`
      SELECT *
      FROM EBibRec
    `);
    await addJobrecomment(result.recordset);
    res.json(result.recordset);

});

app.get('/getNewBooks', async (req, res) => {
  
  let connection;
  connection = await connectionMysql.getConnection();
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 10;
    const offset = (page - 1) * pageSize;

    const [result] = await connection.query(
      `SELECT * FROM books 
       WHERE image IS NOT NULL AND image != '' 
       ORDER BY EntrDate DESC 
       LIMIT ? OFFSET ?`,
      [pageSize, offset]
    );
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching new books:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

app.get('/getRecommentBooks', async (req, res) => {
  let connection;
  try {
    connection = await connectionMysql.getConnection();
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 10;
    const offset = (page - 1) * pageSize;

    // Query to fetch recommended books based on relationships with RecommentBook.bookId
    const [result] = await connection.query(`
      SELECT DISTINCT b.*
      FROM books b
      INNER JOIN RecommentBook rb ON b.bookId = rb.bookId
      ORDER BY b.EntrDate DESC
      LIMIT ? OFFSET ?
    `, [pageSize, offset]);

    res.json(result);
  } catch (error) {
    console.error('Error fetching recommended books:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

app.get('/getTopBooks', async (req, res) => {
  let connection;
  try {
    connection = await connectionMysql.getConnection();
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 10;
    const offset = (page - 1) * pageSize;

    // Query to fetch recommended books based on relationships with RecommentBook.bookId
    const [result] = await connection.query(`
      SELECT DISTINCT b.*
      FROM books b
      INNER JOIN TopBook rb ON b.bookId = rb.bookId
      LIMIT ? OFFSET ?
    `, [pageSize, offset]);

    res.json(result);
  } catch (error) {
    console.error('Error fetching recommended books:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

app.get('/getCollection', async (req, res) => {

  let connection;
  connection = await connectionMysql.getConnection();
  try {

    const collectionIDs = [1, 2, 3,4,5,6,7]; // ตัวอย่างของ collectionID

    // Fetch getCollection
    const [collections] = await connection.query('SELECT * FROM collection WHERE id IN (?)', [collectionIDs]);

    // เพิ่มการนับจำนวนหนังสือสำหรับแต่ละคอลเลคชัน
    for (let i = 0; i < collections.length; i++) {
      const collection = collections[i];
      const [bookCountResult] = await connection.query('SELECT COUNT(*) AS count FROM books WHERE collectionID = ?', [collection.id]);
      collection.bookCount = bookCountResult[0].count;
    }

    res.json(collections);

  } catch (error) {
    console.error('Error fetching getCollection', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connection) {
      // ปิดการเชื่อมต่อ
      await connection.end();
    }
  }

});

app.get('/image', async (req, res) => {

  const imageName = '000019907.jpg';
  const formattedImageName = formatImageName(imageName);
  console.log(formattedImageName); // Output: 000/028/940.jpg

});

app.get('/getTop', async (req, res) => {

    try {
    const pool = await poolPromise;

    // Query to fetch count of records grouped by ItemNo
    const result = await pool.request()
    .query(`
      SELECT TOP 40 CM.ItemNo, COUNT(*) AS TotalCount, CI.ItemBib
      FROM CMCirculation CM
      JOIN CItem CI ON CM.ItemNo = CI.ItemNo
      WHERE YEAR(CM.ChkODate) = 2024
      GROUP BY CM.ItemNo, CI.ItemBib
      ORDER BY TotalCount DESC
    `);

    await addJobTop(result.recordset);
    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
  });

app.get('/get_item', async (req, res) => {

  const pool = await poolPromise;
  const result = await pool.request()
    .query(`
      SELECT CItem.*, CItemClass.*
      FROM CItem
      JOIN CItemClass ON CItem.ItemClss = CItemClass.Class
      WHERE CItem.ItemBib = 30599;
    `);

    res.json(result.recordset);

});

//http://localhost:3000/getBooks?page=1&pageSize=10
app.get('/getBooks', async (req, res) => {
  let connection;
  try {
    connection = await connectionMysql.getConnection();

    // Pagination parameters
    const page = parseInt(req.query.page) || 1; // Current page number (default: 1)
    const pageSize = parseInt(req.query.pageSize) || 10; // Number of items per page (default: 10)
    const offset = (page - 1) * pageSize; // Offset calculation

    // Fetch books with pagination
const [books] = await connection.query(`
  SELECT *
  FROM books
  ORDER BY bookId DESC
  LIMIT ?
  OFFSET ?
`, [pageSize, offset]);

// Object to hold formatted responses for books
const formattedBooks = [];

// Loop through each book
for (let i = 0; i < books.length; i++) {
  const book = books[i];

  // Initialize formatted book object
  let formattedBook = {
    ...book,
    bookName: book.bookName,
    subjects: [],
    bookItem: [],
    bookPdf: []
  };

  // Add subjects for the current book
  const [subjects] = await connection.query('SELECT * FROM subject WHERE bookId = ?', [book.bookId]);
  formattedBook.subjects = subjects.map(subject => ({
    SubCnt: subject.SubCnt,
    name: subject.name
  }));

  // Add book items for the current book
  const [bookItems] = await connection.query('SELECT * FROM bookItem WHERE bookId = ?', [book.bookId]);
  formattedBook.bookItem = bookItems.map(item => ({
    ItemNo: item.ItemNo,
    Cmponent: item.Cmponent,
    callNumber: item.callNumber,
    BookCategory: item.BookCategory
  }));

// Add pdfBook for the current book
const [pdfBooks] = await connection.query('SELECT pdfBook.*, typePdf.name AS typeName FROM pdfBook JOIN typePdf ON pdfBook.type = typePdf.id WHERE pdfBook.bookId = ?', [book.bookId]);
formattedBook.bookPdf = pdfBooks.map(item => ({
  pdfName: item.pdfName,
  MmId: item.MmId,
  urlPdf: item.urlPdf,
  type: item.type,
  typeName: item.typeName // Add typeName from typePdf
}));

  // Push the formatted book into the array
  formattedBooks.push(formattedBook);
}

// Send formatted books as JSON response
res.json(formattedBooks);

  } catch (error) {
    console.error('Error fetching books:', error);
    res.status(500).send('Internal Server Error');
  } finally {
    if (connection) connection.release();
  }
});


app.get('/getBooksByCollectionID', async (req, res) => {
  let connection;
  connection = await connectionMysql.getConnection();
  
  try {
    const collectionID = req.query.collectionID;
    console.log('collectionID', collectionID);
    
    // Fetch books by collectionID
    const [books] = await connection.query('SELECT * FROM books WHERE collectionID = ? ORDER BY bookId DESC', [collectionID]);

    // Object to hold formatted responses for books
    const formattedBooks = [];

    // Loop through each book
    for (let i = 0; i < books.length; i++) {
      const book = books[i];

      // Initialize formatted book object
      let formattedBook = {
        ...book,
        bookName: book.bookName,
        subjects: [],
        bookItem: [],
        bookPdf: []
      };

      // Add subjects for the current book
      const [subjects] = await connection.query('SELECT * FROM subject WHERE bookId = ?', [book.bookId]);
      formattedBook.subjects = subjects.map(subject => ({
        SubCnt: subject.SubCnt,
        name: subject.name
      }));

      // Add book items for the current book
      const [bookItems] = await connection.query('SELECT * FROM bookItem WHERE bookId = ?', [book.bookId]);
      formattedBook.bookItem = bookItems.map(item => ({
        ItemNo: item.ItemNo,
        Cmponent: item.Cmponent,
        callNumber: item.callNumber,
        BookCategory: item.BookCategory
      }));

      // Add pdfBook for the current book
      const [pdfBooks] = await connection.query('SELECT pdfBook.*, typePdf.name AS typeName FROM pdfBook JOIN typePdf ON pdfBook.type = typePdf.id WHERE pdfBook.bookId = ?', [book.bookId]);
      formattedBook.bookPdf = pdfBooks.map(item => ({
        pdfName: item.pdfName,
        MmId: item.MmId,
        urlPdf: item.urlPdf,
        type: item.type,
        typeName: item.typeName // Add typeName from typePdf
      }));

      // Push the formatted book into the array
      formattedBooks.push(formattedBook);
    }

    // Send formatted books as JSON response
    res.json(formattedBooks);
  } catch (error) {
    console.error('Error fetching books by collectionID:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connection) {
      // ปิดการเชื่อมต่อ
      await connection.end();
    }
  }
});

//http://localhost:3000/getBooksByID?bookId=203
app.get('/getBooksByID', async (req, res) => {
  let connection;
  connection = await connectionMysql.getConnection();
  try {
    const bookId = req.query.bookId;
    console.log('bookId', bookId)
    // Fetch books by ID
    const [books] = await connection.query('SELECT * FROM books WHERE bookId = ?', [bookId]);

    // Object to hold formatted responses for books
    const formattedBooks = [];

    // Loop through each book
    for (let i = 0; i < books.length; i++) {
      const book = books[i];

      // Initialize formatted book object
      let formattedBook = {
        ...book,
        bookName: book.bookName,
        subjects: [],
        bookItem: [],
        bookPdf: []
      };

      // Add subjects for the current book
      const [subjects] = await connection.query('SELECT * FROM subject WHERE bookId = ?', [book.bookId]);
      formattedBook.subjects = subjects.map(subject => ({
        SubCnt: subject.SubCnt,
        name: subject.name
      }));

      // Add book items for the current book
      const [bookItems] = await connection.query('SELECT * FROM bookItem WHERE bookId = ?', [book.bookId]);
      formattedBook.bookItem = bookItems.map(item => ({
        ItemNo: item.ItemNo,
        Cmponent: item.Cmponent,
        callNumber: item.callNumber,
        BookCategory: item.BookCategory
      }));

      // Add pdfBook for the current book
      const [pdfBooks] = await connection.query('SELECT pdfBook.*, typePdf.name AS typeName FROM pdfBook JOIN typePdf ON pdfBook.type = typePdf.id WHERE pdfBook.bookId = ?', [book.bookId]);
      formattedBook.bookPdf = pdfBooks.map(item => ({
        pdfName: item.pdfName,
        MmId: item.MmId,
        urlPdf: item.urlPdf,
        type: item.type,
        typeName: item.typeName // Add typeName from typePdf
      }));

      // Push the formatted book into the array
      formattedBooks.push(formattedBook);
    }

    // Send formatted books as JSON response
    res.json(formattedBooks);
  } catch (error) {
    console.error('Error fetching books by ID:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

function formatImageName(imageName) {
  // Extract the numeric part of the image name, assuming it does not include the file extension
  const numericPart = imageName.substring(0, imageName.lastIndexOf('.'));
  const fileExtension = imageName.substring(imageName.lastIndexOf('.'));

  // Format the numeric part with slashes
  const formattedPart = `https://kpi-lib.com/multim/www-cover/Main/${numericPart.substring(0, 3)}/${numericPart.substring(3, 6)}/${imageName}`;

  // Combine the formatted part with the file extension
  return formattedPart;
}

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});