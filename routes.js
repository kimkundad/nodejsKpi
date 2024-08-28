const express = require('express');
const router = express.Router();
const puppeteer = require('puppeteer')
const {
  sql,
  poolPromise
} = require('./dbPool');
const connectionMysql = require('./mysqlConfig');
const {
  addJob,
  addJob2,
  addJobrecomment,
  addJobTop,
  addJobTopW,
  addJobTopWM,
} = require('./jobHandlers');

const path = require('path');

router.get('/dataCount', async (req, res) => {
  let connection;
  try {
    connection = await poolPromise;

    const result = await connection.request()
      .query(`
          SELECT COUNT(*) AS TotalRows
          FROM EBib
          JOIN EEtcBib ON EBib.BibId = EEtcBib.EBBibId
          JOIN EEtc ON EEtcBib.EBEtcId = EEtc.EtcId
          JOIN ENte ON EEtcBib.EBBibId = ENte.NteBibId
          JOIN ECvr ON EEtcBib.EBBibId = ECvr.CvrBibId
          WHERE ENte.NteTag = 505 OR ENte.NteTag = 500
        `);

    const totalCount = result.recordset[0].TotalRows;

    res.json({
      totalCount
    });
  } catch (error) {
    console.error('Error fetching count:', error);
    res.status(500).json({
      error: 'Internal Server Error'
    });
  }
});

//"totalCount": 31169

router.get('/data', async (req, res) => {
  try {
    const {
      page = 1, pageSize = 10
    } = req.query;
    const offset = (page - 1) * pageSize;
    const pool = await poolPromise;

    const getCount = await pool.request().query(`
        SELECT COUNT(*) AS TotalRows
        FROM EBib
        JOIN EEtcBib ON EBib.BibId = EEtcBib.EBBibId
      `);

    const maxNum = getCount.recordset[0].TotalRows;
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
        console.log('Processing data job xx:', startNum);
        allResults = allResults.concat(result.recordset);
        await addJob(result.recordset);
      }
    }
    res.json(allResults);
  } catch (err) {
    console.error('Error executing query:', err);
    res.status(500).send('Error retrieving data');
  }
});

// http://localhost:3000/dataBookOne?bookId=31515
router.get('/dataBookOne', async (req, res) => {
  try {
    const pool = await poolPromise;
    const bookId = parseInt(req.query.bookId);
    let allResults = [];

      const result = await pool.request()
        .input('bookId', sql.Int, bookId)
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
          WHERE mainID = @bookId;
        `);

      if (result.recordset.length > 0) {
        allResults = allResults.concat(result.recordset);
        await addJob(result.recordset);
      }
    
    res.json(allResults);
  } catch (err) {
    console.error('Error executing query:', err);
    res.status(500).send('Error retrieving data');
  }
});

// ssh root@209.15.114.122
//https://kpilib-api.ideavivat.com/dataBookOne2?bookId=31509
// http://localhost:3000/dataBookOne?bookId=31515 vs
router.get('/dataBookOne2', async (req, res) => {
  try {

    const pool = await poolPromise;
    const bookId = parseInt(req.query.bookId);

    await insertBooks([bookId]);

  //  await insertBooks(bookIDs);

  } catch (err) {
    console.error('Error executing query:', err);
    res.status(500).send('Error retrieving data');
  }
});


const insertBooks = async (bookIDs) => {
  const pool = await poolPromise;
  console.log('bookIDs==>>>', bookIDs);
  const detailBooksPromises = bookIDs.map(async (bookID) => {
    const detailBookResult = await pool.request()
      .input('EBBibId', bookID)
      .query(`
        SELECT EBEtcId, EBInd, EBTag
        FROM EEtcBib
        WHERE EBBibId = @EBBibId;
      `);
    return {
      bookID,
      details: detailBookResult.recordset
    };
  });

  const detailBooks = await Promise.all(detailBooksPromises);

  console.log('insertBooks==>>>', detailBooks);

  const datax = detailBooks.map(async (item) => {
    const dataloopin = item.details.map(async (detail) => {

      const detailBookResult = await pool.request()
        .input('EtcId', detail.EBEtcId)
        .query(`
          SELECT *
          FROM EEtc
          WHERE EtcId = @EtcId;
        `);

      const Ebib = await pool.request()
        .input('bookID', item.bookID)
        .query(`
          SELECT CalRaw, EntrDate
          FROM EBib
          WHERE BibId = @bookID;
        `);

      const ENte = await pool.request()
        .input('bookID', item.bookID)
        .query(`
          SELECT NteRaw
          FROM ENte
          WHERE NteBibId = @bookID AND (ENte.NteTag = 505 OR ENte.NteTag = 500); 
        `);

      const ECvr = await pool.request()
        .input('bookID', item.bookID)
        .query(`
          SELECT CvrFilename
          FROM ECvr
          WHERE CvrBibId = @bookID;
        `);

      const processedDetailBooks = detailBookResult.recordset.map(record => ({
        ...record,
        "mainID": item.bookID,
        "CallNumber": Ebib?.recordset[0]?.CalRaw ?? null,
        "EntrDate": Ebib?.recordset[0]?.EntrDate ?? null,
        "bookName": record?.EtcRaw ?? null,
        "EtcId": detail.EBEtcId ?? null,
        "Book_Content": ENte?.recordset[0]?.NteRaw ?? null,
        "ENte": ENte?.recordset[0]?.NteRaw ?? null,
        "CvrFilename": ECvr?.recordset[0]?.CvrFilename ? formatImageName(ECvr.recordset[0].CvrFilename) : "https://kpilib-api.ideavivat.com/kpibook-placeholder",
        "EBInd": detail?.EBInd ?? null,
        "EBTag": detail?.EBTag ?? null,
        "EBEtcId": detail?.EBEtcId ?? null,
      }));

      console.log('ECvr==>>>', item.bookID);
      await addJob(processedDetailBooks);
      return {
        bookID: item.bookID,
        detailBooks: processedDetailBooks,
      };
    });

    const detailBooksData = await Promise.all(dataloopin);
    return detailBooksData;
  });

  const processedData = await Promise.all(datax);
  const flattenedProcessedData = processedData.flat();

  console.log('Processed Data:', flattenedProcessedData);
};

/////////////////////////////////////////////////////////////////

router.get('/getNewBooks', async (req, res) => {
  let connection;
  try {
    connection = await connectionMysql.getConnection();

    // Pagination parameters
    const page = parseInt(req.query.page) || 1; // Current page number (default: 1)
    const pageSize = parseInt(req.query.pageSize) || 10; // Number of items per page (default: 10)
    const offset = (page - 1) * pageSize; // Offset calculation

    // Fetch books with pagination
    const [result] = await connection.query(
      `SELECT * FROM books 
         WHERE image IS NOT NULL AND image != 'https://kpilib-api.ideavivat.com/kpibook-placeholder' 
         ORDER BY EntrDate DESC 
         LIMIT ? OFFSET ?`,
      [parseInt(pageSize), parseInt(offset)]
    );

    const response = {
      totalBooks: pageSize,
      items: result
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching new books:', error);
    res.status(500).json({
      error: 'Internal Server Error'
    });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/getRecommentBooks', async (req, res) => {
  let connection;
  try {
    connection = await connectionMysql.getConnection();
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 10;
    const offset = (page - 1) * pageSize;

    // Query to fetch recommended books based on relationships with RecommentBook.bookId
    const [result] = await connection.query(`
        SELECT b.*
      FROM books b
      INNER JOIN RecommentBook rb ON b.bookId = rb.bookId
      ORDER BY rb.sortby ASC
      LIMIT ? OFFSET ?
      `, [pageSize, offset]);


      const [totalBooksResult] = await connection.query(`
        SELECT COUNT(DISTINCT b.bookId) as totalBooks
        FROM books b
        INNER JOIN RecommentBook rb ON b.bookId = rb.bookId
      `);
      
      const totalBooks = totalBooksResult[0].totalBooks; // Extract the totalBooks value
      
      const response = {
        totalBooks: totalBooks,
        items: result
      };
      
      res.json(response);


  } catch (error) {
    console.error('Error fetching recommended books:', error);
    res.status(500).json({
      error: 'Internal Server Error'
    });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/getTopBooks', async (req, res) => {
  let connection;
  try {
    connection = await connectionMysql.getConnection();
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 10;
    const offset = (page - 1) * pageSize;

    // Query to fetch recommended books based on relationships with RecommentBook.bookId
    const [result] = await connection.query(`
        SELECT DISTINCT b.*, rb.TotalCount
        FROM books b
        INNER JOIN TopBook rb ON b.bookId = rb.bookId
        ORDER BY rb.TotalCount DESC
        LIMIT ? OFFSET ?
      `, [pageSize, offset]);

    const [totalBooksResult] = await connection.query(`
        SELECT COUNT(DISTINCT b.bookId) as totalBooks
        FROM books b
        INNER JOIN TopBook rb ON b.bookId = rb.bookId
      `);

      const totalBooks = totalBooksResult[0].totalBooks; // Extract the totalBooks value

    const response = {
      totalBooks: totalBooks,
      items: result
    };

    // Send formatted books as JSON response
    res.json(response);

  } catch (error) {
    console.error('Error fetching recommended books:', error);
    res.status(500).json({
      error: 'Internal Server Error'
    });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/getTopBooksWeek', async (req, res) => {
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
        INNER JOIN topWeek rb ON b.bookId = rb.bookId
        ORDER BY b.EntrDate DESC
        LIMIT ? OFFSET ?
      `, [pageSize, offset]);

    const [totalBooksResult] = await connection.query(`
        SELECT COUNT(DISTINCT b.bookId) as totalBooks
        FROM books b
        INNER JOIN topWeek rb ON b.bookId = rb.bookId
      `);

      const totalBooks = totalBooksResult[0].totalBooks; // Extract the totalBooks value

    const response = {
      totalBooks: totalBooks,
      items: result
    };

    // Send formatted books as JSON response
    res.json(response);

  } catch (error) {
    console.error('Error fetching recommended books:', error);
    res.status(500).json({
      error: 'Internal Server Error'
    });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/getTopBooksMonth', async (req, res) => {
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
        INNER JOIN topMonth rb ON b.bookId = rb.bookId
        ORDER BY b.EntrDate DESC
        LIMIT ? OFFSET ?
      `, [pageSize, offset]);

    const [totalBooksResult] = await connection.query(`
        SELECT COUNT(DISTINCT b.bookId) as totalBooks
        FROM books b
        INNER JOIN topMonth rb ON b.bookId = rb.bookId
      `);

      const totalBooks = totalBooksResult[0].totalBooks; // Extract the totalBooks value

    const response = {
      totalBooks: totalBooks,
      items: result
    };

    // Send formatted books as JSON response
    res.json(response);

  } catch (error) {
    console.error('Error fetching recommended books:', error);
    res.status(500).json({
      error: 'Internal Server Error'
    });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/getCollection', async (req, res) => {

  let connection;
  connection = await connectionMysql.getConnection();
  try {
    const collectionIDs = [1, 2, 3, 4, 5, 6, 7]; // ตัวอย่างของ collectionID
    // Fetch getCollection
    const [collections] = await connection.query('SELECT * FROM collection WHERE id IN (?)', [collectionIDs]);
    // // เพิ่มการนับจำนวนหนังสือสำหรับแต่ละคอลเลคชัน
    // for (let i = 0; i < collections.length; i++) {
    //   const collection = collections[i];
    //   const [bookCountResult] = await connection.query('SELECT COUNT(*) AS count FROM CollectionBookId WHERE collectionId = ?', [collection.id]);
    //   collection.bookCount = bookCountResult[0].count;
    // }

    const responsez = {
      collections
    };
    // Send formatted books as JSON response
    res.json(responsez);

   // res.json(collections);
  } catch (error) {
    console.error('Error fetching getCollection', error);
    res.status(500).json({
      error: 'Internal Server Error'
    });
  } finally {
    if (connection) connection.release();
  }

});

//http://localhost:3000/getBooks?page=1&pageSize=10
router.get('/getBooks', async (req, res) => {
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
      LIMIT ? OFFSET ?
    `, [pageSize, offset]);

    // Fetch all subjects, bookItems, and pdfBooks in parallel
    const bookIds = books.map(book => book.bookId);

    const [subjects] = await connection.query(`
      SELECT *
      FROM subject
      WHERE bookId IN (?)
    `, [bookIds]);

    const [bookItems] = await connection.query(`
      SELECT *
      FROM bookItem
      WHERE bookId IN (?)
    `, [bookIds]);

    const [pdfBooks] = await connection.query(`
      SELECT pdfBook.*, typePdf.name AS typeName
      FROM pdfBook
      JOIN typePdf ON pdfBook.type = typePdf.id
      WHERE pdfBook.bookId IN (?)
    `, [bookIds]);

    const [results] = await connection.query(`
      SELECT *, (SELECT COUNT(*) FROM books) as totalBooks
      FROM books
      ORDER BY bookId DESC
    `);

    const totalBooks = results.length > 0 ? results[0].totalBooks : 0;

    // Create a map for quick lookup
    const subjectsMap = subjects.reduce((acc, subject) => {
      if (!acc[subject.bookId]) acc[subject.bookId] = [];
      acc[subject.bookId].push({
        SubCnt: subject.SubCnt,
        name: subject.name
      });
      return acc;
    }, {});

    const bookItemsMap = bookItems.reduce((acc, item) => {
      if (!acc[item.bookId]) acc[item.bookId] = [];
      acc[item.bookId].push({
        ItemNo: item.ItemNo,
        Cmponent: item.Cmponent,
        callNumber: item.callNumber,
        BookCategory: item.BookCategory
      });
      return acc;
    }, {});

    const pdfBooksMap = pdfBooks.reduce((acc, item) => {
      if (!acc[item.bookId]) acc[item.bookId] = [];
      acc[item.bookId].push({
        pdfName: item.pdfName,
        MmId: item.MmId,
        urlPdf: item.urlPdf,
        type: item.type,
        typeName: item.typeName
      });
      return acc;
    }, {});

    // Format books with related data
    const formattedBooks = books.map(book => ({
      ...book,
      bookName: book.bookName,
      subjects: subjectsMap[book.bookId] || [],
      bookItem: bookItemsMap[book.bookId] || [],
      bookPdf: pdfBooksMap[book.bookId] || []
    }));


    const response = {
      totalBooks: totalBooks,
      items: formattedBooks
    };

    // Send formatted books as JSON response
    res.json(response);

  } catch (error) {
    console.error('Error fetching books:', error);
    res.status(500).send('Internal Server Error');
  } finally {
    if (connection) connection.release();
  }
});

router.get('/getBooksByCollectionID', async (req, res) => {
  let connection;
  try {
    connection = await connectionMysql.getConnection();

    const collectionID = req.query.collectionID;
    console.log('collectionID', collectionID);

    // Pagination parameters
    const page = parseInt(req.query.page) || 1; // Current page number (default: 1)
    const pageSize = parseInt(req.query.pageSize) || 10; // Number of items per page (default: 10)
    const offset = (page - 1) * pageSize; // Offset calculation

    // Fetch books by collectionID with pagination
    const [books] = await connection.query(
      'SELECT * FROM books WHERE collectionID = ? ORDER BY bookId DESC LIMIT ? OFFSET ?',
      [collectionID, pageSize, offset]
    );

    const [results] = await connection.query(
      'SELECT COUNT(*) as totalBooks FROM books WHERE collectionID = ?',
      [collectionID]
    );

    const totalBooks = results.length > 0 ? results[0].totalBooks : 0;

    // Collect all bookIds for further queries
    const bookIds = books.map(book => book.bookId);

    // Fetch all related data in parallel
    const [subjects] = await connection.query(
      'SELECT * FROM subject WHERE bookId IN (?)',
      [bookIds]
    );

    const [bookItems] = await connection.query(
      'SELECT * FROM bookItem WHERE bookId IN (?)',
      [bookIds]
    );

    const [pdfBooks] = await connection.query(
      'SELECT pdfBook.*, typePdf.name AS typeName FROM pdfBook JOIN typePdf ON pdfBook.type = typePdf.id WHERE pdfBook.bookId IN (?)',
      [bookIds]
    );

    // Map related data to their respective books
    const subjectsMap = subjects.reduce((acc, subject) => {
      if (!acc[subject.bookId]) acc[subject.bookId] = [];
      acc[subject.bookId].push({
        SubCnt: subject.SubCnt,
        name: subject.name
      });
      return acc;
    }, {});

    const bookItemsMap = bookItems.reduce((acc, item) => {
      if (!acc[item.bookId]) acc[item.bookId] = [];
      acc[item.bookId].push({
        ItemNo: item.ItemNo,
        Cmponent: item.Cmponent,
        callNumber: item.callNumber,
        BookCategory: item.BookCategory
      });
      return acc;
    }, {});

    const pdfBooksMap = pdfBooks.reduce((acc, item) => {
      if (!acc[item.bookId]) acc[item.bookId] = [];
      acc[item.bookId].push({
        pdfName: item.pdfName,
        MmId: item.MmId,
        urlPdf: item.urlPdf,
        type: item.type,
        typeName: item.typeName // Add typeName from typePdf
      });
      return acc;
    }, {});

    // Format books with related data
    const formattedBooks = books.map(book => ({
      ...book,
      bookName: book.bookName,
      subjects: subjectsMap[book.bookId] || [],
      bookItem: bookItemsMap[book.bookId] || [],
      bookPdf: pdfBooksMap[book.bookId] || []
    }));

    const response = {
      totalBooks: totalBooks,
      items: formattedBooks
    };
    // Send formatted books as JSON response
    res.json(response);

  } catch (error) {
    console.error('Error fetching books by collectionID:', error);
    res.status(500).json({
      error: 'Internal Server Error'
    });
  } finally {
    if (connection) {
      await connection.release();
    }
  }
});

router.get('/getBooksByID', async (req, res) => {
  let connection;
  try {
    connection = await connectionMysql.getConnection();
    const bookId = req.query.bookId;
    console.log('bookId', bookId);

    // Fetch book by ID
    const [books] = await connection.query('SELECT * FROM books WHERE bookId = ?', [bookId]);

    if (books.length === 0) {
      return res.status(404).json({
        error: 'Book not found'
      });
    }

    const book = books[0];

    // Initialize formatted book object
    let formattedBook = {
      ...book,
      bookName: book.bookName,
      subjects: [],
      bookItem: [],
      bookPdf: [],
      AdditionalAuthors: []
    };

    // Fetch subjects for the current book
    const [subjects] = await connection.query('SELECT * FROM subject WHERE bookId = ? ORDER BY name ASC', [book.bookId]);
    formattedBook.subjects = subjects.map(subject => ({
      SubCnt: subject.SubCnt,
      name: subject.name,
      EtcId: subject.EtcId,
      Url: subject.Url
    }));

    // Fetch Additional Authors for the current book
    const [AdditionalAuthor] = await connection.query('SELECT * FROM AdditionalAuthors WHERE bookId = ?', [book.bookId]);
    formattedBook.AdditionalAuthors = AdditionalAuthor.map(Additional => ({
      EtcCnt: Additional.EtcCnt,
      name: Additional.name,
      EtcId: Additional.EEtcBib,
      Url: Additional.Url
    }));

    // Fetch book items for the current book including the image from books table
    const [bookItems] = await connection.query(`
        SELECT bookItem.*, books.image
        FROM bookItem
        JOIN books ON bookItem.bookId = books.bookId
        WHERE bookItem.bookId = ?
      `, [book.bookId]);
    formattedBook.bookItem = bookItems.map(item => ({
      ItemNo: item.ItemNo,
      Cmponent: item.Cmponent,
      callNumber: item.callNumber,
      BookCategory: item.BookCategory,
      image: item.image, // Add image to the bookItem
      status: 'avaliable'
    }));

    // Fetch pdfBooks for the current book
    const [pdfBooks] = await connection.query('SELECT pdfBook.*, typePdf.name AS typeName FROM pdfBook JOIN typePdf ON pdfBook.type = typePdf.id WHERE pdfBook.bookId = ?', [book.bookId]);
    formattedBook.bookPdf = pdfBooks.map(item => ({
      pdfName: item.pdfName,
      MmId: item.MmId,
      urlPdf: item.urlPdf,
      type: item.type,
      typeName: item.typeName // Add typeName from typePdf
    }));

    // Send formatted book as JSON response
    res.json(formattedBook);
  } catch (error) {
    console.error('Error fetching books by ID:', error);
    res.status(500).json({
      error: 'Internal Server Error'
    });
  } finally {
    if (connection) {
      await connection.release();
    }
  }
});

router.get('/get_item', async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
        SELECT CItem.*, CItemClass.*
        FROM CItem
        JOIN CItemClass ON CItem.ItemClss = CItemClass.Class
        WHERE CItem.ItemBib = 30599;
      `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching item data:', error);
    res.status(500).json({
      error: 'Internal Server Error'
    });
  }
});

router.get('/get_930', async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
        SELECT *
        FROM EEtcBib
        WHERE EBEtcId = 28 and EBTag = 930;
      `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching item data:', error);
    res.status(500).json({
      error: 'Internal Server Error'
    });
  }
});


router.get('/get_930count', async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
        SELECT COUNT(*) AS TotalBooks
        FROM EEtcBib
        WHERE EBEtcId = 28 and EBTag = 930;
      `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching item data:', error);
    res.status(500).json({
      error: 'Internal Server Error'
    });
  }
});

//31515
router.get('/get_930list', async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
        SELECT EBEtcId
        FROM EEtcBib
        WHERE EBBibId = 31515;
      `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching item data:', error);
    res.status(500).json({
      error: 'Internal Server Error'
    });
  }
});


router.get('/get_930sing', async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
        SELECT *
        FROM EEtc
        WHERE EtcId = 28;
      `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching item data:', error);
    res.status(500).json({
      error: 'Internal Server Error'
    });
  }
});

//เพิ่ม  วารสารสถาบันพระปกเกล้า 35798 930
router.get('/add_dataBookslist930', async (req, res) => {
  
  try {
    const pool = await poolPromise;

    const getCount = await pool.request()
      .input('EBEtcId', 35798)
      .input('EBTag', 930)
      .query(`
        SELECT COUNT(*) AS TotalRows
        FROM EEtcBib
        WHERE EBEtcId = @EBEtcId AND EBTag = @EBTag;
      `);

    const maxNum = getCount.recordset[0].TotalRows;

    for (let startNum = 0; startNum <= maxNum; startNum++) {

      const { page = 1, pageSize = 10 } = req.query; // Default to page 1 and pageSize 10

    const result = await pool.request()
      .input('EBEtcId', sql.Int, 35798)
      .input('EBTag', sql.Int, 930)
      .input('pageSize', sql.Int, 1)
      .input('offset', sql.Int, startNum)
      .query(`
        WITH PaginatedData AS (
          SELECT
            EBBibId as EBBibId,
            ROW_NUMBER() OVER (ORDER BY EBBibId DESC) AS RowNum
          FROM EEtcBib
          WHERE EBEtcId = @EBEtcId AND EBTag = @EBTag
        )
        SELECT EBBibId
        FROM PaginatedData
        WHERE RowNum > @offset AND RowNum <= (@offset + @pageSize);
      `);
    
    //  const paginatedData = result.recordset;
    
        // const result = await pool.request()
        // .input('EBEtcId', 28)
        // .input('EBTag', 930)
        // .query(`
        //   SELECT EBBibId
        //   FROM EEtcBib
        //   WHERE EBEtcId = @EBEtcId and EBTag = @EBTag 
        //   ORDER BY EBBibId DESC;
        // `);
  
      const bookIDs = result.recordset.map(row => row.EBBibId);

      const [resultxx] = await connectionMysql.query(
        `DELETE FROM CollectionBookId 
           WHERE BookId = ? `,
        [parseInt(bookIDs)]
      );
    
      console.log('bookIDs-->', resultxx)
  
      const detailBooksPromises = bookIDs.map(async bookID => {
        const detailBookResult = await pool.request()
          .input('EBBibId', bookID)
          .query(`
            SELECT EBEtcId, EBInd, EBTag
            FROM EEtcBib
            WHERE EBBibId = @EBBibId;
          `);
        return detailBookResult.recordset;
      });
  
      const detailBooks = await Promise.all(detailBooksPromises);
  
      const combinedResults = bookIDs.map((bookID, index) => ({
        bookID,
        detailBooks: detailBooks[index]
      }));
  
  
      const datax = combinedResults.map(async item => {
        const dataloopin = item.detailBooks.map(async detail => {
  
          const detailBookResult = await pool.request()
            .input('EtcId', detail.EBEtcId)
            .query(`
              SELECT *
              FROM EEtc
              WHERE EtcId = @EtcId;
            `);
  
  
            const Ebib = await pool.request()
            .input('bookID', item.bookID)
            .query(`
            SELECT CalRaw, EntrDate
            FROM EBib
            WHERE BibId = @bookID;
            `);
  
            const ENte = await pool.request()
            .input('bookID', item.bookID)
            .query(`
            SELECT NteRaw
            FROM ENte
            WHERE NteBibId = @bookID and (ENte.NteTag = 505 OR ENte.NteTag = 500); 
            `);
  
            const ECvr = await pool.request()
            .input('bookID', item.bookID)
            .query(`
            SELECT CvrFilename
            FROM ECvr
            WHERE CvrBibId = @bookID;
            `);
  
            const processedDetailBooks = detailBookResult.recordset.map(record => ({
              ...record,
              "mainID": item.bookID,
              "CallNumber": Ebib?.recordset[0]?.CalRaw ?? null,
              "EntrDate": Ebib?.recordset[0]?.EntrDate ?? null,
              "bookName": record?.EtcRaw ?? null,
              "Book_Content": ENte?.recordset[0]?.NteRaw ?? null,
              "ENte": ENte?.recordset[0]?.NteRaw ?? null,
              "CvrFilename": ECvr?.recordset[0]?.CvrFilename ? formatImageName(ECvr.recordset[0].CvrFilename) : "https://kpilib-api.ideavivat.com/kpibook-placeholder",
              "EBInd": detail?.EBInd ?? null,
              "EBTag": detail?.EBTag ?? null,
              "EBEtcId": detail?.EBEtcId ?? null,
            }));
      
          // Assuming detailBookResult.recordset is an array of fetched details
  
          console.log('ECvr==>>>', item.bookID);
          await addJob(processedDetailBooks);
          return {
            bookID: item.bookID,
            detailBooks: processedDetailBooks ,
          };
        });
      
        // Wait for all dataloopin promises to resolve for the current item
        const detailBooksData = await Promise.all(dataloopin);
        
        return detailBooksData;
      });
      
      // Wait for all datax promises to resolve
      const processedData = await Promise.all(datax);
      
      // Flatten processedData if needed
      const flattenedProcessedData = processedData.flat();
      
      // Log or send flattenedProcessedData as JSON response
     // res.json(flattenedProcessedData);

      
    }
    


    
  } catch (error) {
    console.error('Error fetching item data:', error);
    res.status(500).json({
      error: 'Internal Server Error'
    });
  }



});

//เพิ่ม  สิ่งพิมพ์สถาบันพระปกเกล้า 28 930
router.get('/add_dataBookslist28', async (req, res) => {
  
  try {
    const pool = await poolPromise;

    const getCount = await pool.request()
      .input('EBEtcId', 28)
      .input('EBTag', 930)
      .query(`
        SELECT COUNT(*) AS TotalRows
        FROM EEtcBib
        WHERE EBEtcId = @EBEtcId AND EBTag = @EBTag;
      `);

    const maxNum = getCount.recordset[0].TotalRows;

    for (let startNum = 1; startNum <= maxNum; startNum++) {

      const { page = 1, pageSize = 10 } = req.query; // Default to page 1 and pageSize 10

    const result = await pool.request()
      .input('EBEtcId', sql.Int, 28)
      .input('EBTag', sql.Int, 930)
      .input('pageSize', sql.Int, 1)
      .input('offset', sql.Int, startNum)
      .query(`
        WITH PaginatedData AS (
          SELECT
            EBBibId as EBBibId,
            ROW_NUMBER() OVER (ORDER BY EBBibId DESC) AS RowNum
          FROM EEtcBib
          WHERE EBEtcId = @EBEtcId AND EBTag = @EBTag
        )
        SELECT EBBibId
        FROM PaginatedData
        WHERE RowNum > @offset AND RowNum <= (@offset + @pageSize);
      `);
    
    //  const paginatedData = result.recordset;
    
        // const result = await pool.request()
        // .input('EBEtcId', 28)
        // .input('EBTag', 930)
        // .query(`
        //   SELECT EBBibId
        //   FROM EEtcBib
        //   WHERE EBEtcId = @EBEtcId and EBTag = @EBTag 
        //   ORDER BY EBBibId DESC;
        // `);
  
      const bookIDs = result.recordset.map(row => row.EBBibId);

      const [resultxx] = await connectionMysql.query(
        `DELETE FROM CollectionBookId 
           WHERE BookId = ? `,
        [parseInt(bookIDs)]
      );
    
     // console.log('bookIDs-->', resultxx)
  
      const detailBooksPromises = bookIDs.map(async bookID => {
        const detailBookResult = await pool.request()
          .input('EBBibId', bookID)
          .query(`
            SELECT EBEtcId, EBInd, EBTag
            FROM EEtcBib
            WHERE EBBibId = @EBBibId;
          `);
        return detailBookResult.recordset;
      });
  
      const detailBooks = await Promise.all(detailBooksPromises);
  
      const combinedResults = bookIDs.map((bookID, index) => ({
        bookID,
        detailBooks: detailBooks[index]
      }));
  
  
      const datax = combinedResults.map(async item => {
        const dataloopin = item.detailBooks.map(async detail => {
  
          const detailBookResult = await pool.request()
            .input('EtcId', detail.EBEtcId)
            .query(`
              SELECT *
              FROM EEtc
              WHERE EtcId = @EtcId;
            `);
  
  
            const Ebib = await pool.request()
            .input('bookID', item.bookID)
            .query(`
            SELECT CalRaw, EntrDate
            FROM EBib
            WHERE BibId = @bookID;
            `);
  
            const ENte = await pool.request()
            .input('bookID', item.bookID)
            .query(`
            SELECT NteRaw
            FROM ENte
            WHERE NteBibId = @bookID and (ENte.NteTag = 505 OR ENte.NteTag = 500); 
            `);
  
            const ECvr = await pool.request()
            .input('bookID', item.bookID)
            .query(`
            SELECT CvrFilename
            FROM ECvr
            WHERE CvrBibId = @bookID;
            `);
  
            const processedDetailBooks = detailBookResult.recordset.map(record => ({
              ...record,
              "mainID": item.bookID,
              "CallNumber": Ebib?.recordset[0]?.CalRaw ?? null,
              "EntrDate": Ebib?.recordset[0]?.EntrDate ?? null,
              "bookName": record?.EtcRaw ?? null,
              "Book_Content": ENte?.recordset[0]?.NteRaw ?? null,
              "ENte": ENte?.recordset[0]?.NteRaw ?? null,
              "CvrFilename": ECvr?.recordset[0]?.CvrFilename ? formatImageName(ECvr.recordset[0].CvrFilename) : "https://kpilib-api.ideavivat.com/kpibook-placeholder",
              "EBInd": detail?.EBInd ?? null,
              "EBTag": detail?.EBTag ?? null,
              "EBEtcId": detail?.EBEtcId ?? null,
            }));
      
          // Assuming detailBookResult.recordset is an array of fetched details
  
          console.log('ECvr==>>>', item.bookID);
          await addJob(processedDetailBooks);
          return {
            bookID: item.bookID,
            detailBooks: processedDetailBooks ,
          };
        });
      
        // Wait for all dataloopin promises to resolve for the current item
        const detailBooksData = await Promise.all(dataloopin);
        
        return detailBooksData;
      });
      
      // Wait for all datax promises to resolve
      const processedData = await Promise.all(datax);
      
      // Flatten processedData if needed
      const flattenedProcessedData = processedData.flat();
      
      // Log or send flattenedProcessedData as JSON response
     // res.json(flattenedProcessedData);

      
    }
    


    
  } catch (error) {
    console.error('Error fetching item data:', error);
    res.status(500).json({
      error: 'Internal Server Error'
    });
  }



});

//เพิ่ม  รายงานนักศึกษาสถาบันพระปกเกล้า 44 930
router.get('/add_dataBookslist44', async (req, res) => {
  
  try {
    const pool = await poolPromise;

    const getCount = await pool.request()
      .input('EBEtcId', 44)
      .input('EBTag', 930)
      .query(`
        SELECT COUNT(*) AS TotalRows
        FROM EEtcBib
        WHERE EBEtcId = @EBEtcId AND EBTag = @EBTag;
      `);

    const maxNum = getCount.recordset[0].TotalRows;

    for (let startNum = 0; startNum <= maxNum; startNum++) {

      const { page = 1, pageSize = 10 } = req.query; // Default to page 1 and pageSize 10

    const result = await pool.request()
      .input('EBEtcId', sql.Int, 44)
      .input('EBTag', sql.Int, 930)
      .input('pageSize', sql.Int, 1)
      .input('offset', sql.Int, startNum)
      .query(`
        WITH PaginatedData AS (
          SELECT
            EBBibId as EBBibId,
            ROW_NUMBER() OVER (ORDER BY EBBibId DESC) AS RowNum
          FROM EEtcBib
          WHERE EBEtcId = @EBEtcId AND EBTag = @EBTag
        )
        SELECT EBBibId
        FROM PaginatedData
        WHERE RowNum > @offset AND RowNum <= (@offset + @pageSize);
      `);
    
    //  const paginatedData = result.recordset;
    
        // const result = await pool.request()
        // .input('EBEtcId', 28)
        // .input('EBTag', 930)
        // .query(`
        //   SELECT EBBibId
        //   FROM EEtcBib
        //   WHERE EBEtcId = @EBEtcId and EBTag = @EBTag 
        //   ORDER BY EBBibId DESC;
        // `);
  
      const bookIDs = result.recordset.map(row => row.EBBibId);

      const [resultxx] = await connectionMysql.query(
        `DELETE FROM CollectionBookId 
           WHERE BookId = ? `,
        [parseInt(bookIDs)]
      );
    
      // console.log('bookIDs-->', resultxx)
  
      const detailBooksPromises = bookIDs.map(async bookID => {
        const detailBookResult = await pool.request()
          .input('EBBibId', bookID)
          .query(`
            SELECT EBEtcId, EBInd, EBTag
            FROM EEtcBib
            WHERE EBBibId = @EBBibId;
          `);
        return detailBookResult.recordset;
      });
  
      const detailBooks = await Promise.all(detailBooksPromises);
  
      const combinedResults = bookIDs.map((bookID, index) => ({
        bookID,
        detailBooks: detailBooks[index]
      }));
  
  
      const datax = combinedResults.map(async item => {
        const dataloopin = item.detailBooks.map(async detail => {
  
          const detailBookResult = await pool.request()
            .input('EtcId', detail.EBEtcId)
            .query(`
              SELECT *
              FROM EEtc
              WHERE EtcId = @EtcId;
            `);
  
  
            const Ebib = await pool.request()
            .input('bookID', item.bookID)
            .query(`
            SELECT CalRaw, EntrDate
            FROM EBib
            WHERE BibId = @bookID;
            `);
  
            const ENte = await pool.request()
            .input('bookID', item.bookID)
            .query(`
            SELECT NteRaw
            FROM ENte
            WHERE NteBibId = @bookID and (ENte.NteTag = 505 OR ENte.NteTag = 500); 
            `);
  
            const ECvr = await pool.request()
            .input('bookID', item.bookID)
            .query(`
            SELECT CvrFilename
            FROM ECvr
            WHERE CvrBibId = @bookID;
            `);
  
            const processedDetailBooks = detailBookResult.recordset.map(record => ({
              ...record,
              "mainID": item.bookID,
              "CallNumber": Ebib?.recordset[0]?.CalRaw ?? null,
              "EntrDate": Ebib?.recordset[0]?.EntrDate ?? null,
              "bookName": record?.EtcRaw ?? null,
              "Book_Content": ENte?.recordset[0]?.NteRaw ?? null,
              "ENte": ENte?.recordset[0]?.NteRaw ?? null,
              "CvrFilename": ECvr?.recordset[0]?.CvrFilename ? formatImageName(ECvr.recordset[0].CvrFilename) : "https://kpilib-api.ideavivat.com/kpibook-placeholder",
              "EBInd": detail?.EBInd ?? null,
              "EBTag": detail?.EBTag ?? null,
              "EBEtcId": detail?.EBEtcId ?? null,
            }));
      
          // Assuming detailBookResult.recordset is an array of fetched details
  
         // console.log('ECvr==>>>', item.bookID);
          await addJob(processedDetailBooks);
          return {
            bookID: item.bookID,
            detailBooks: processedDetailBooks ,
          };
        });
      
        // Wait for all dataloopin promises to resolve for the current item
        const detailBooksData = await Promise.all(dataloopin);
        
        return detailBooksData;
      });
      
      // Wait for all datax promises to resolve
      const processedData = await Promise.all(datax);
      
      // Flatten processedData if needed
      const flattenedProcessedData = processedData.flat();
      
      // Log or send flattenedProcessedData as JSON response
     // res.json(flattenedProcessedData);

      
    }
    


    
  } catch (error) {
    console.error('Error fetching item data:', error);
    res.status(500).json({
      error: 'Internal Server Error'
    });
  }



});

//เพิ่ม  พระปกเกล้าศึกษา 1501 930
router.get('/add_dataBookslist1501', async (req, res) => {

  try {
    const pool = await poolPromise;

    const getCount = await pool.request()
      .input('EBEtcId', 1501)
      .input('EBTag', 930)
      .query(`
        SELECT COUNT(*) AS TotalRows
        FROM EEtcBib
        WHERE EBEtcId = @EBEtcId AND EBTag = @EBTag;
      `);

    const maxNum = getCount.recordset[0].TotalRows;

    for (let startNum = 0; startNum <= maxNum; startNum++) {

      const { page = 1, pageSize = 10 } = req.query; // Default to page 1 and pageSize 10

    const result = await pool.request()
      .input('EBEtcId', sql.Int, 1501)
      .input('EBTag', sql.Int, 930)
      .input('pageSize', sql.Int, 1)
      .input('offset', sql.Int, startNum)
      .query(`
        WITH PaginatedData AS (
          SELECT
            EBBibId as EBBibId,
            ROW_NUMBER() OVER (ORDER BY EBBibId DESC) AS RowNum
          FROM EEtcBib
          WHERE EBEtcId = @EBEtcId AND EBTag = @EBTag
        )
        SELECT EBBibId
        FROM PaginatedData
        WHERE RowNum > @offset AND RowNum <= (@offset + @pageSize);
      `);
    
    //  const paginatedData = result.recordset;
    
        // const result = await pool.request()
        // .input('EBEtcId', 28)
        // .input('EBTag', 930)
        // .query(`
        //   SELECT EBBibId
        //   FROM EEtcBib
        //   WHERE EBEtcId = @EBEtcId and EBTag = @EBTag 
        //   ORDER BY EBBibId DESC;
        // `);
  
      const bookIDs = result.recordset.map(row => row.EBBibId);
  
      const [resultxx] = await connectionMysql.query(
        `DELETE FROM CollectionBookId 
           WHERE BookId = ? `,
        [parseInt(bookIDs)]
      );
    
    //  console.log('bookIDs-->', resultxx)

      const detailBooksPromises = bookIDs.map(async bookID => {
        const detailBookResult = await pool.request()
          .input('EBBibId', bookID)
          .query(`
            SELECT EBEtcId, EBInd, EBTag
            FROM EEtcBib
            WHERE EBBibId = @EBBibId;
          `);
        return detailBookResult.recordset;
      });
  
      const detailBooks = await Promise.all(detailBooksPromises);
  
      const combinedResults = bookIDs.map((bookID, index) => ({
        bookID,
        detailBooks: detailBooks[index]
      }));
  
  
      const datax = combinedResults.map(async item => {
        const dataloopin = item.detailBooks.map(async detail => {
  
          const detailBookResult = await pool.request()
            .input('EtcId', detail.EBEtcId)
            .query(`
              SELECT *
              FROM EEtc
              WHERE EtcId = @EtcId;
            `);
  
  
            const Ebib = await pool.request()
            .input('bookID', item.bookID)
            .query(`
            SELECT CalRaw, EntrDate
            FROM EBib
            WHERE BibId = @bookID;
            `);
  
            const ENte = await pool.request()
            .input('bookID', item.bookID)
            .query(`
            SELECT NteRaw
            FROM ENte
            WHERE NteBibId = @bookID and (ENte.NteTag = 505 OR ENte.NteTag = 500); 
            `);
  
            const ECvr = await pool.request()
            .input('bookID', item.bookID)
            .query(`
            SELECT CvrFilename
            FROM ECvr
            WHERE CvrBibId = @bookID;
            `);
  
            const processedDetailBooks = detailBookResult.recordset.map(record => ({
              ...record,
              "mainID": item.bookID,
              "CallNumber": Ebib?.recordset[0]?.CalRaw ?? null,
              "EntrDate": Ebib?.recordset[0]?.EntrDate ?? null,
              "bookName": record?.EtcRaw ?? null,
              "Book_Content": ENte?.recordset[0]?.NteRaw ?? null,
              "ENte": ENte?.recordset[0]?.NteRaw ?? null,
              "CvrFilename": ECvr?.recordset[0]?.CvrFilename ? formatImageName(ECvr.recordset[0].CvrFilename) : "https://kpilib-api.ideavivat.com/kpibook-placeholder",
              "EBInd": detail?.EBInd ?? null,
              "EBTag": detail?.EBTag ?? null,
              "EBEtcId": detail?.EBEtcId ?? null,
            }));
      
          // Assuming detailBookResult.recordset is an array of fetched details
  
      //    console.log('ECvr==>>>', item.bookID);
          await addJob(processedDetailBooks);
          return {
            bookID: item.bookID,
            detailBooks: processedDetailBooks ,
          };
        });
      
        // Wait for all dataloopin promises to resolve for the current item
        const detailBooksData = await Promise.all(dataloopin);
        
        return detailBooksData;
      });
      
      // Wait for all datax promises to resolve
      const processedData = await Promise.all(datax);
      
      // Flatten processedData if needed
      const flattenedProcessedData = processedData.flat();
      
      // Log or send flattenedProcessedData as JSON response
     // res.json(flattenedProcessedData);

      
    }
    


    
  } catch (error) {
    console.error('Error fetching item data:', error);
    res.status(500).json({
      error: 'Internal Server Error'
    });
  }



});

//เพิ่ม  หนังสืออนุสรณ์งานศพนักการเมือง 8090 930
router.get('/add_dataBookslist8090', async (req, res) => {
  
  try {
    const pool = await poolPromise;

    const getCount = await pool.request()
      .input('EBEtcId', 8090)
      .input('EBTag', 930)
      .query(`
        SELECT COUNT(*) AS TotalRows
        FROM EEtcBib
        WHERE EBEtcId = @EBEtcId AND EBTag = @EBTag;
      `);

    let maxNum = getCount.recordset[0].TotalRows;

    for (let startNum = 0; startNum <= maxNum; startNum++) {

      const { page = 1, pageSize = 10 } = req.query; // Default to page 1 and pageSize 10

    const result = await pool.request()
      .input('EBEtcId', sql.Int, 8090)
      .input('EBTag', sql.Int, 930)
      .input('pageSize', sql.Int, 10)
      .input('offset', sql.Int, startNum)
      .query(`
        WITH PaginatedData AS (
          SELECT
            EBBibId as EBBibId,
            ROW_NUMBER() OVER (ORDER BY EBBibId DESC) AS RowNum
          FROM EEtcBib
          WHERE EBEtcId = @EBEtcId AND EBTag = @EBTag
        )
        SELECT EBBibId
        FROM PaginatedData
        WHERE RowNum > @offset AND RowNum <= (@offset + @pageSize);
      `);
    
    //  const paginatedData = result.recordset;
    
        // const result = await pool.request()
        // .input('EBEtcId', 28)
        // .input('EBTag', 930)
        // .query(`
        //   SELECT EBBibId
        //   FROM EEtcBib
        //   WHERE EBEtcId = @EBEtcId and EBTag = @EBTag 
        //   ORDER BY EBBibId DESC;
        // `);
  
      const bookIDs = result.recordset.map(row => row.EBBibId);

      const [resultxx] = await connectionMysql.query(
        `DELETE FROM CollectionBookId 
           WHERE BookId = ? `,
        [parseInt(bookIDs)]
      );
    
      console.log('bookIDs-->', resultxx)
  
      const detailBooksPromises = bookIDs.map(async bookID => {
        const detailBookResult = await pool.request()
          .input('EBBibId', bookID)
          .query(`
            SELECT EBEtcId, EBInd, EBTag
            FROM EEtcBib
            WHERE EBBibId = @EBBibId;
          `);
        return detailBookResult.recordset;
      });
  
      const detailBooks = await Promise.all(detailBooksPromises);
  
      const combinedResults = bookIDs.map((bookID, index) => ({
        bookID,
        detailBooks: detailBooks[index]
      }));
  
  
      const datax = combinedResults.map(async item => {
        const dataloopin = item.detailBooks.map(async detail => {
  
          const detailBookResult = await pool.request()
            .input('EtcId', detail.EBEtcId)
            .query(`
              SELECT *
              FROM EEtc
              WHERE EtcId = @EtcId;
            `);
  
  
            const Ebib = await pool.request()
            .input('bookID', item.bookID)
            .query(`
            SELECT CalRaw, EntrDate
            FROM EBib
            WHERE BibId = @bookID;
            `);
  
            const ENte = await pool.request()
            .input('bookID', item.bookID)
            .query(`
            SELECT NteRaw
            FROM ENte
            WHERE NteBibId = @bookID and (ENte.NteTag = 505 OR ENte.NteTag = 500); 
            `);
  
            const ECvr = await pool.request()
            .input('bookID', item.bookID)
            .query(`
            SELECT CvrFilename
            FROM ECvr
            WHERE CvrBibId = @bookID;
            `);
  
            const processedDetailBooks = detailBookResult.recordset.map(record => ({
              ...record,
              "mainID": item.bookID,
              "CallNumber": Ebib?.recordset[0]?.CalRaw ?? null,
              "EntrDate": Ebib?.recordset[0]?.EntrDate ?? null,
              "bookName": record?.EtcRaw ?? null,
              "Book_Content": ENte?.recordset[0]?.NteRaw ?? null,
              "ENte": ENte?.recordset[0]?.NteRaw ?? null,
              "CvrFilename": ECvr?.recordset[0]?.CvrFilename ? formatImageName(ECvr.recordset[0].CvrFilename) : "https://kpilib-api.ideavivat.com/kpibook-placeholder",
              "EBInd": detail?.EBInd ?? null,
              "EBTag": detail?.EBTag ?? null,
              "EBEtcId": detail?.EBEtcId ?? null,
            }));
      
          // Assuming detailBookResult.recordset is an array of fetched details
  
          console.log('ECvr==>>>', item.bookID);
          await addJob(processedDetailBooks);
          return {
            bookID: item.bookID,
            detailBooks: processedDetailBooks ,
          };
        });
      
        // Wait for all dataloopin promises to resolve for the current item
        const detailBooksData = await Promise.all(dataloopin);
        
        return detailBooksData;
      });
      
      // Wait for all datax promises to resolve
      const processedData = await Promise.all(datax);
      
      // Flatten processedData if needed
      const flattenedProcessedData = processedData.flat();
      
      // Log or send flattenedProcessedData as JSON response
     // res.json(flattenedProcessedData);

      
    }
    


    
  } catch (error) {
    console.error('Error fetching item data:', error);
    res.status(500).json({
      error: 'Internal Server Error'
    });
  }



});

//เพิ่ม  ผลงานนักวิชาการ 1590 930
router.get('/add_dataBookslist1590', async (req, res) => {
  
  try {
    const pool = await poolPromise;

    const getCount = await pool.request()
      .input('EBEtcId', 1590)
      .input('EBTag', 930)
      .query(`
        SELECT COUNT(*) AS TotalRows
        FROM EEtcBib
        WHERE EBEtcId = @EBEtcId AND EBTag = @EBTag;
      `);

    const maxNum = getCount.recordset[0].TotalRows;

    for (let startNum = 0; startNum <= maxNum; startNum++) {

      const { page = 1, pageSize = 10 } = req.query; // Default to page 1 and pageSize 10

    const result = await pool.request()
      .input('EBEtcId', sql.Int, 1590)
      .input('EBTag', sql.Int, 930)
      .input('pageSize', sql.Int, 1)
      .input('offset', sql.Int, startNum)
      .query(`
        WITH PaginatedData AS (
          SELECT
            EBBibId as EBBibId,
            ROW_NUMBER() OVER (ORDER BY EBBibId DESC) AS RowNum
          FROM EEtcBib
          WHERE EBEtcId = @EBEtcId AND EBTag = @EBTag
        )
        SELECT EBBibId
        FROM PaginatedData
        WHERE RowNum > @offset AND RowNum <= (@offset + @pageSize);
      `);
    
    //  const paginatedData = result.recordset;
    
        // const result = await pool.request()
        // .input('EBEtcId', 28)
        // .input('EBTag', 930)
        // .query(`
        //   SELECT EBBibId
        //   FROM EEtcBib
        //   WHERE EBEtcId = @EBEtcId and EBTag = @EBTag 
        //   ORDER BY EBBibId DESC;
        // `);
  
      const bookIDs = result.recordset.map(row => row.EBBibId);

      const [resultxx] = await connectionMysql.query(
        `DELETE FROM CollectionBookId 
           WHERE BookId = ? `,
        [parseInt(bookIDs)]
      );
    
      console.log('bookIDs-->', resultxx)
  
      const detailBooksPromises = bookIDs.map(async bookID => {
        const detailBookResult = await pool.request()
          .input('EBBibId', bookID)
          .query(`
            SELECT EBEtcId, EBInd, EBTag
            FROM EEtcBib
            WHERE EBBibId = @EBBibId;
          `);
        return detailBookResult.recordset;
      });
  
      const detailBooks = await Promise.all(detailBooksPromises);
  
      const combinedResults = bookIDs.map((bookID, index) => ({
        bookID,
        detailBooks: detailBooks[index]
      }));
  
  
      const datax = combinedResults.map(async item => {
        const dataloopin = item.detailBooks.map(async detail => {
  
          const detailBookResult = await pool.request()
            .input('EtcId', detail.EBEtcId)
            .query(`
              SELECT *
              FROM EEtc
              WHERE EtcId = @EtcId;
            `);
  
  
            const Ebib = await pool.request()
            .input('bookID', item.bookID)
            .query(`
            SELECT CalRaw, EntrDate
            FROM EBib
            WHERE BibId = @bookID;
            `);
  
            const ENte = await pool.request()
            .input('bookID', item.bookID)
            .query(`
            SELECT NteRaw
            FROM ENte
            WHERE NteBibId = @bookID and (ENte.NteTag = 505 OR ENte.NteTag = 500); 
            `);
  
            const ECvr = await pool.request()
            .input('bookID', item.bookID)
            .query(`
            SELECT CvrFilename
            FROM ECvr
            WHERE CvrBibId = @bookID;
            `);
  
            const processedDetailBooks = detailBookResult.recordset.map(record => ({
              ...record,
              "mainID": item.bookID,
              "CallNumber": Ebib?.recordset[0]?.CalRaw ?? null,
              "EntrDate": Ebib?.recordset[0]?.EntrDate ?? null,
              "bookName": record?.EtcRaw ?? null,
              "Book_Content": ENte?.recordset[0]?.NteRaw ?? null,
              "ENte": ENte?.recordset[0]?.NteRaw ?? null,
              "CvrFilename": ECvr?.recordset[0]?.CvrFilename ? formatImageName(ECvr.recordset[0].CvrFilename) : "https://kpilib-api.ideavivat.com/kpibook-placeholder",
              "EBInd": detail?.EBInd ?? null,
              "EBTag": detail?.EBTag ?? null,
              "EBEtcId": detail?.EBEtcId ?? null,
            }));
      
          // Assuming detailBookResult.recordset is an array of fetched details
  
          await addJob(processedDetailBooks);
          return {
            bookID: item.bookID,
            detailBooks: processedDetailBooks ,
          };
        });
      
        // Wait for all dataloopin promises to resolve for the current item
        const detailBooksData = await Promise.all(dataloopin);
        
        return detailBooksData;
      });
      
      // Wait for all datax promises to resolve
      const processedData = await Promise.all(datax);
      
      // Flatten processedData if needed
      const flattenedProcessedData = processedData.flat();
      
      // Log or send flattenedProcessedData as JSON response
     // res.json(flattenedProcessedData);

      
    }
    


    
  } catch (error) {
    console.error('Error fetching item data:', error);
    res.status(500).json({
      error: 'Internal Server Error'
    });
  }



});

//เพิ่ม  งานวิจัยสถาบันพระปกเกล้า 29 930
router.get('/add_dataBookslist29', async (req, res) => {
  
  try {
    const pool = await poolPromise;

    const getCount = await pool.request()
      .input('EBEtcId', 29)
      .input('EBTag', 930)
      .query(`
        SELECT COUNT(*) AS TotalRows
        FROM EEtcBib
        WHERE EBEtcId = @EBEtcId AND EBTag = @EBTag;
      `);

    const maxNum = getCount.recordset[0].TotalRows;

    for (let startNum = 0; startNum <= maxNum; startNum++) {

      const { page = 1, pageSize = 10 } = req.query; // Default to page 1 and pageSize 10

    const result = await pool.request()
      .input('EBEtcId', sql.Int, 29)
      .input('EBTag', sql.Int, 930)
      .input('pageSize', sql.Int, 1)
      .input('offset', sql.Int, startNum)
      .query(`
        WITH PaginatedData AS (
          SELECT
            EBBibId as EBBibId,
            ROW_NUMBER() OVER (ORDER BY EBBibId DESC) AS RowNum
          FROM EEtcBib
          WHERE EBEtcId = @EBEtcId AND EBTag = @EBTag
        )
        SELECT EBBibId
        FROM PaginatedData
        WHERE RowNum > @offset AND RowNum <= (@offset + @pageSize);
      `);
    
    //  const paginatedData = result.recordset;
    
        // const result = await pool.request()
        // .input('EBEtcId', 28)
        // .input('EBTag', 930)
        // .query(`
        //   SELECT EBBibId
        //   FROM EEtcBib
        //   WHERE EBEtcId = @EBEtcId and EBTag = @EBTag 
        //   ORDER BY EBBibId DESC;
        // `);
  
      const bookIDs = result.recordset.map(row => row.EBBibId);

      const [resultxx] = await connectionMysql.query(
        `DELETE FROM CollectionBookId 
           WHERE BookId = ? `,
        [parseInt(bookIDs)]
      );
    
      console.log('bookIDs-->', resultxx)
  
      const detailBooksPromises = bookIDs.map(async bookID => {
        const detailBookResult = await pool.request()
          .input('EBBibId', bookID)
          .query(`
            SELECT EBEtcId, EBInd, EBTag
            FROM EEtcBib
            WHERE EBBibId = @EBBibId;
          `);
        return detailBookResult.recordset;
      });
  
      const detailBooks = await Promise.all(detailBooksPromises);
  
      const combinedResults = bookIDs.map((bookID, index) => ({
        bookID,
        detailBooks: detailBooks[index]
      }));
  
  
      const datax = combinedResults.map(async item => {
        const dataloopin = item.detailBooks.map(async detail => {
  
          const detailBookResult = await pool.request()
            .input('EtcId', detail.EBEtcId)
            .query(`
              SELECT *
              FROM EEtc
              WHERE EtcId = @EtcId;
            `);
  
  
            const Ebib = await pool.request()
            .input('bookID', item.bookID)
            .query(`
            SELECT CalRaw, EntrDate
            FROM EBib
            WHERE BibId = @bookID;
            `);
  
            const ENte = await pool.request()
            .input('bookID', item.bookID)
            .query(`
            SELECT NteRaw
            FROM ENte
            WHERE NteBibId = @bookID and (ENte.NteTag = 505 OR ENte.NteTag = 500); 
            `);
  
            const ECvr = await pool.request()
            .input('bookID', item.bookID)
            .query(`
            SELECT CvrFilename
            FROM ECvr
            WHERE CvrBibId = @bookID;
            `);
  
            const processedDetailBooks = detailBookResult.recordset.map(record => ({
              ...record,
              "mainID": item.bookID,
              "CallNumber": Ebib?.recordset[0]?.CalRaw ?? null,
              "EntrDate": Ebib?.recordset[0]?.EntrDate ?? null,
              "bookName": record?.EtcRaw ?? null,
              "Book_Content": ENte?.recordset[0]?.NteRaw ?? null,
              "ENte": ENte?.recordset[0]?.NteRaw ?? null,
              "CvrFilename": ECvr?.recordset[0]?.CvrFilename ? formatImageName(ECvr.recordset[0].CvrFilename) : "https://kpilib-api.ideavivat.com/kpibook-placeholder",
              "EBInd": detail?.EBInd ?? null,
              "EBTag": detail?.EBTag ?? null,
              "EBEtcId": detail?.EBEtcId ?? null,
            }));
      
          // Assuming detailBookResult.recordset is an array of fetched details
  
          console.log('ECvr==>>>', item.bookID);
          await addJob(processedDetailBooks);
          return {
            bookID: item.bookID,
            detailBooks: processedDetailBooks ,
          };
        });
      
        // Wait for all dataloopin promises to resolve for the current item
        const detailBooksData = await Promise.all(dataloopin);
        
        return detailBooksData;
      });
      
      // Wait for all datax promises to resolve
      const processedData = await Promise.all(datax);
      
      // Flatten processedData if needed
      const flattenedProcessedData = processedData.flat();
      
      // Log or send flattenedProcessedData as JSON response
     // res.json(flattenedProcessedData);

      
    }
    


    
  } catch (error) {
    console.error('Error fetching item data:', error);
    res.status(500).json({
      error: 'Internal Server Error'
    });
  }



});

//เพิ่มหนังสือมาใหม่ // ECvr
router.get('/AddNewbooks', async (req, res) => {
  try {
    const pool = await poolPromise;

    // Query to fetch top 40 records grouped by ItemNo
    const maxNum = 100;
        let allResults = [];

        for (let startNum = 0; startNum <= maxNum; startNum++) {
            const { page = 1, pageSize = 10 } = req.query;

            // First SQL Server query to get book IDs with pagination
            const result = await pool.request()
                .input('pageSize', sql.Int, pageSize)
                .input('offset', sql.Int, startNum * pageSize)
                .query(`
                    WITH Pagination AS (
                        SELECT EBib.BibId as bookId, ROW_NUMBER() OVER (ORDER BY EBib.BibId DESC) AS RowNum
                        FROM EBib
                        INNER JOIN ECvr ON EBib.BibId = ECvr.CvrBibId
                    )
                    SELECT bookId
                    FROM Pagination
                    WHERE RowNum > @offset AND RowNum <= (@offset + @pageSize)
                `);

            const bookIDs = result.recordset.map(row => row.bookId);

            if (bookIDs.length === 0) {
                continue;
            }

            // MySQL deletion
            const deleteResult = await connectionMysql.query(
                `DELETE FROM CollectionBookId WHERE BookId IN (?)`, [bookIDs]
            );

            console.log('Deleted Book IDs from MySQL:', deleteResult);

            // Fetch details for each book ID
            const detailBooksPromises = bookIDs.map(async bookID => {
                const detailBookResult = await pool.request()
                    .input('bookID', sql.Int, bookID)
                    .query(`
                        SELECT EBEtcId, EBInd, EBTag
                        FROM EEtcBib
                        WHERE EBBibId = @bookID
                    `);
                return detailBookResult.recordset;
            });

            const detailBooks = await Promise.all(detailBooksPromises);

            const combinedResults = bookIDs.map((bookID, index) => ({
                bookID,
                detailBooks: detailBooks[index]
            }));

            const datax = combinedResults.map(async item => {
                const dataloopin = item.detailBooks.map(async detail => {
                    const detailBookResult = await pool.request()
                        .input('EtcId', detail.EBEtcId)
                        .query(`
                            SELECT *
                            FROM EEtc
                            WHERE EtcId = @EtcId
                        `);

                    const Ebib = await pool.request()
                        .input('bookID', sql.Int, item.bookID)
                        .query(`
                            SELECT CalRaw, EntrDate
                            FROM EBib
                            WHERE BibId = @bookID
                        `);

                    const ENte = await pool.request()
                        .input('bookID', sql.Int, item.bookID)
                        .query(`
                            SELECT NteRaw
                            FROM ENte
                            WHERE NteBibId = @bookID AND (NteTag = 505 OR NteTag = 500)
                        `);

                    const ECvr = await pool.request()
                        .input('bookID', sql.Int, item.bookID)
                        .query(`
                            SELECT CvrFilename
                            FROM ECvr
                            WHERE CvrBibId = @bookID
                        `);

                    const processedDetailBooks = detailBookResult.recordset.map(record => ({
                        ...record,
                        mainID: item.bookID,
                        CallNumber: Ebib?.recordset[0]?.CalRaw ?? null,
                        EntrDate: Ebib?.recordset[0]?.EntrDate ?? null,
                        bookName: record?.EtcRaw ?? null,
                        Book_Content: ENte?.recordset[0]?.NteRaw ?? null,
                        ENte: ENte?.recordset[0]?.NteRaw ?? null,
                        CvrFilename: ECvr?.recordset[0]?.CvrFilename ? formatImageName(ECvr.recordset[0].CvrFilename) : "https://kpilib-api.ideavivat.com/kpibook-placeholder",
                        EBInd: detail?.EBInd ?? null,
                        EBTag: detail?.EBTag ?? null,
                        EBEtcId: detail?.EBEtcId ?? null,
                    }));

                    await addJob(processedDetailBooks);
                    return {
                        bookID: item.bookID,
                        detailBooks: processedDetailBooks,
                    };
                });

                const detailBooksData = await Promise.all(dataloopin);
                return detailBooksData;
            });

            const processedData = await Promise.all(datax);
            const flattenedProcessedData = processedData.flat();
            allResults = allResults.concat(flattenedProcessedData);
        }

        // Optionally, send allResults as a JSON response
        res.json(allResults);

  //  res.json(initialResult.recordset.length);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({
      error: 'Internal Server Error'
    });
  }
});

//เพิ่มยอดนิยม
router.get('/AddTop', async (req, res) => {
  try {
    const pool = await poolPromise;

    //Query to fetch top 40 records grouped by ItemNo
    const result = await pool.request().query(`
      SELECT TOP 100 CM.ItemNo, COUNT(*) AS TotalCount, CI.ItemBib
      FROM CMCirculation CM
      JOIN CItem CI ON CM.ItemNo = CI.ItemNo
      WHERE YEAR(CM.ChkODate) = 2024
      GROUP BY CM.ItemNo, CI.ItemBib
      ORDER BY TotalCount DESC
    `);

    const [resultxx] = await connectionMysql.query(
      `DELETE FROM TopBook 
         WHERE BookId != 0 `
    );

    const bookIDs = result.recordset.map(record => record.ItemBib);

    await insertBooks(bookIDs);
    // const result = await pool.request().query(`
    //   SELECT TOP 100 ItemNo
    //   FROM CMCirculation
    //   WHERE YEAR(ChkODate) = 2024
    // `);

    if (result.recordset.length > 0) {
      await addJobTop(result.recordset);
    }

    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({
      error: 'Internal Server Error'
    });
  }
});

//เพิ่มหนังสือแนะนำเข้าระบบ
router.get('/Addrecomment', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`SELECT * FROM EBibRec`);

    const [resultxx] = await connectionMysql.query(
      `DELETE FROM RecommentBook 
         WHERE BookId != 0 `
    );

    const bookIDs = result.recordset.map(record => record.BibId);
  //  console.log('Addrecomment-->', bookIDs)
    await insertBooks(bookIDs);
    
    await addJobrecomment(result.recordset);
    res.json(result.recordset);
  } catch (err) {
    console.error('Error fetching recommendations:', err);
    res.status(500).json({
      error: 'Internal Server Error'
    });
  }
});

//เพิ่มยอดนิยมสัปดาห์
router.get('/getTopWeek', async (req, res) => {
  try {
    const pool = await poolPromise;

    // Get the current date and the date of the previous week
    const currentDate = new Date();
    const lastWeekDate = new Date(currentDate);
    lastWeekDate.setDate(currentDate.getDate() - 7);

    // Format dates to match SQL Server's datetime format
    const currentDateString = currentDate.toISOString().split('T')[0];
    const lastWeekDateString = lastWeekDate.toISOString().split('T')[0];

    // Query to fetch top 40 records grouped by ItemNo for the last week
    const result = await pool.request().query(`
      SELECT TOP 40 CM.ItemNo, COUNT(*) AS TotalCount, CI.ItemBib
      FROM CMCirculation CM
      JOIN CItem CI ON CM.ItemNo = CI.ItemNo
      WHERE CM.ChkODate BETWEEN '${lastWeekDateString}' AND '${currentDateString}'
      GROUP BY CM.ItemNo, CI.ItemBib
      ORDER BY TotalCount DESC
    `);

    const bookIDs = result.recordset.map(record => record.ItemBib);
    await insertBooks(bookIDs);
    if (result.recordset.length > 0) {
      await addJobTopW(result.recordset);
    }

    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({
      error: 'Internal Server Error'
    });
  }
});

//เพิ่มยอดนิยมรายเดือน
router.get('/getTopMonth', async (req, res) => {
  try {
    const pool = await poolPromise;

    // Get the current date
    const currentDate = new Date();
    
    // Calculate the start and end dates of the last month
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0);

    // Format dates to match SQL Server's datetime format
    const startOfMonthString = startOfMonth.toISOString().split('T')[0];
    const endOfMonthString = endOfMonth.toISOString().split('T')[0];

    // Query to fetch top 40 records grouped by ItemNo for the last month
    const result = await pool.request().query(`
      SELECT TOP 40 CM.ItemNo, COUNT(*) AS TotalCount, CI.ItemBib
      FROM CMCirculation CM
      JOIN CItem CI ON CM.ItemNo = CI.ItemNo
      WHERE CM.ChkODate BETWEEN '${startOfMonthString}' AND '${endOfMonthString}'
      GROUP BY CM.ItemNo, CI.ItemBib
      ORDER BY TotalCount DESC
    `);

    const bookIDs = result.recordset.map(record => record.ItemBib);
    await insertBooks(bookIDs);
    if (result.recordset.length > 0) {
      await addJobTopWM(result.recordset);
    }

    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({
      error: 'Internal Server Error'
    });
  }
});

router.get('/add_dataBookslist99', async (req, res) => {
  try {
    const pool = await poolPromise;

    // Get the page and pageSize from query parameters or use default values
    const page = parseInt(req.query.page, 10) || 1; // Default to page 1
    const pageSize = parseInt(req.query.pageSize, 10) || 10; // Default to pageSize 10
    const offset = (page - 1) * pageSize; // Calculate the offset

    const result = await pool.request()
      .input('EBEtcId', sql.Int, 8090)
      .input('EBTag', sql.Int, 930)
      .input('pageSize', sql.Int, 1)
      .input('offset', sql.Int, 0)
      .query(`
        WITH PaginatedData AS (
          SELECT
            EBBibId as EBBibId,
            ROW_NUMBER() OVER (ORDER BY EBBibId DESC) AS RowNum
          FROM EEtcBib
          WHERE EBEtcId = @EBEtcId AND EBTag = @EBTag
        )
        SELECT EBBibId
        FROM PaginatedData
        WHERE RowNum > @offset AND RowNum <= (@offset + @pageSize);
      `);

    res.json({ data: result.recordset });

  } catch (error) {
    console.error('Error fetching item data:', error);
    res.status(500).json({
      error: 'Internal Server Error'
    });
  }
});


//แก้ไข ebook
router.get('/editEbook', async (req, res) => {

  let connection;
  connection = await connectionMysql.getConnection();

  try {
      // Fetch ebook
      const [result] = await connection.query('SELECT * FROM books WHERE ebook IS NOT NULL');

      const bookIDs = result.map(record => record.bookId);
  //  console.log('Addrecomment-->', bookIDs)
    await insertBooks(bookIDs);
    
    res.json(bookIDs);
  } catch (err) {
    console.error('Error fetching recommendations:', err);
    res.status(500).json({
      error: 'Internal Server Error'
    });
  }
});

//ดึงตัวเลข collection

router.get('/getNumcollection', async (req, res) => {
  let browser;
  let connection;
  connection = await connectionMysql.getConnection();
  try {
    // เปิดเบราว์เซอร์
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.goto('https://kpi-lib.com/elib/cgi-bin/opacexe.exe?op=brw&lang=1&skin=S&db=Main&frm=simsch&cat=alt930&pat=&db=Main&etz.930=&f8lang=&f8pubplace=&i.location=&i.itemclss=&selected_mm=&f8date1=&f8date2=&lpp=50', { waitUntil: 'networkidle2' });
    //


    // วารสารสถาบันพระปกเกล้า - tr:nth-child(9)
    // สิ่งพิมพ์สถาบันพระปกเกล้า - tr:nth-child(11)
    // รายงานนักศึกษาสถาบันพระปกเกล้า - tr:nth-child(7)
    // ผลงานนักวิชาการ - tr:nth-child(5)
    // พระปกเกล้าศึกษา - tr:nth-child(6)
    // หนังสืออนุสรณ์งานศพนักการเมือง - tr:nth-child(12)
    // งานวิจัยสถาบันพระปกเกล้า - tr:nth-child(4)
    // วิทยานิพนธ์ - tr:nth-child(10)
    // รายงานประจำปี - tr:nth-child(8)

    // รอและดึงข้อมูลจากองค์ประกอบที่ต้องการ 
    // const element = await page.waitForSelector('div.container > div.row.container > div > div > table > tbody > tr:nth-child(9) > td.res_rs_td_hit');
    // const text1 = await page.evaluate(el => el.textContent, element);

    // const query1 = `
    //   UPDATE collection
    //   SET bookCount = ?
    //   WHERE id = 1
    // `;
    // await connection.query(query1, text1); // Execute update query


    // ข้อมูลที่ต้องการดึง
    const selectors = [
      { id: 1, selector: 'tr:nth-child(9) > td.res_rs_td_hit' }, // วารสารสถาบันพระปกเกล้า
      { id: 2, selector: 'tr:nth-child(11) > td.res_rs_td_hit' }, // สิ่งพิมพ์สถาบันพระปกเกล้า
      { id: 3, selector: 'tr:nth-child(7) > td.res_rs_td_hit' },  // รายงานนักศึกษาสถาบันพระปกเกล้า
      { id: 4, selector: 'tr:nth-child(5) > td.res_rs_td_hit' },  // ผลงานนักวิชาการ
      { id: 5, selector: 'tr:nth-child(6) > td.res_rs_td_hit' },  // พระปกเกล้าศึกษา
      { id: 6, selector: 'tr:nth-child(12) > td.res_rs_td_hit' }, // หนังสืออนุสรณ์งานศพนักการเมือง
      { id: 7, selector: 'tr:nth-child(4) > td.res_rs_td_hit' },  // งานวิจัยสถาบันพระปกเกล้า
      { id: 9, selector: 'tr:nth-child(10) > td.res_rs_td_hit' }, // วิทยานิพนธ์
      { id: 10, selector: 'tr:nth-child(8) > td.res_rs_td_hit' }   // รายงานประจำปี
    ];

    const updatedAt = new Date();

    // ดึงข้อมูลและอัปเดตฐานข้อมูล
    for (const item of selectors) {
      const element = await page.waitForSelector(`div.container > div.row.container > div > div > table > tbody > ${item.selector}`);
      const text = await page.evaluate(el => el.textContent, element);
      
      const query = `
        UPDATE collection
        SET bookCount = ?, update_at = ?
        WHERE id = ?
      `;
      await connection.query(query, [text, updatedAt, item.id]);
    }

    res.send('Data updated successfully'); // ส่งข้อความตอบกลับ

  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('An error occurred');
  } finally {
    // ปิดเบราว์เซอร์
    if (browser) {
      await browser.close();
    }
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

router.get('/kpibook-placeholder', async (req, res) => {
  const imagePath = path.join(__dirname, 'public/assets/image/kpibook-placeholder.jpg');
  res.sendFile(imagePath);
});

// Similar optimizations can be done for other routes...

module.exports = router;