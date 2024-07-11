// queue.js
const { Queue, Worker } = require('bullmq');
const mysql = require('mysql2/promise');
const { sql, poolPromise } = require('./dbPool');
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


const connection = {
  host: '127.0.0.1',
  port: 6379,
};

// สร้างคิว
const jobQueue = new Queue('jobQueue', { connection });

// กำหนด job processor
const worker = new Worker('jobQueue', async (job) => {
  console.log(`Processing job ${job.id}:`, job.data);

  try {
    if (!job.data) {
      throw new Error('Job data is empty or undefined');
    }


    if (job.name === 'TopBook') {
      // Process the job
      console.log('Processing TopBook job xx:', job.data);

      let connection1;
      try {
        connection1 = await connectionMysql.getConnection();
        await connection1.beginTransaction();
        
        const { ItemBib, ItemNo, TotalCount } = job.data;
        // Delete existing records based on conditions
        const deleteQuery = `
          DELETE FROM TopBook
        `;
        await connection1.query(deleteQuery, [ItemBib]);

      } catch (error) {
        if (connection1) await connection1.rollback();
        throw error;
      } finally {
        if (connection1) connection1.release();
      }

      for (const item of job.data) {
        await updateTopBook(item);
      }
    }

  if (job.name === 'Recomment') {
    // Process the job
    console.log('Processing Recomment job xx:', job.data);
    for (const item of job.data) {
      await updateRecommentBook(item);
    }
  }
  
  
  if(job.name === 'job'){

     // Modify data to remove '\a' from CallNumber and bookName
  const modifiedData = job.data.map(item => ({
    ...item,
    CallNumber: item.CallNumber.replace(/\\[abc]/g, ''),
    bookName: item.bookName.replace(/\\[abdcxz]/g, ''),
    Book_Content: item.Book_Content.replace(/\\[abc]/g, ''),
    CvrFilename: formatImageName(item.CvrFilename),
    EBInd: item.EBInd.trim()
  }));
  
  
  for (const item of modifiedData) {
    const existingRecord = await checkExistingRecord(item.mainID);

    if(item.EBTag == 245){
      if (existingRecord) {
        await updateData(item);
      } else {
        await insertData(item);
      }
    }

    if(item.EBTag == 246){
      if (existingRecord) {
        await updateNameEn(item);
      } else {
        await insertNameEn(item);
      }
    }

    if(item.EBTag == 856){

      if (item.bookName.includes('Ebook')) {
      item.bookName = item.bookName.replace(/^\\nEbook\\u%UrlRedir1%\//, '/');
      item.bookName = item.bookName.replace(/^\\nEbook\\u%\$UrlRedir0%\//, '/');

      if (existingRecord) {
        await updateEbook(item);
      } else {
        await insertEbook(item);
      }

    }

    }

    if(item.EBInd == 0 && item.EBTag == 100){
      if (existingRecord) {
        await updateAuthor(item);
      } else {
        await insertAuthor(item);
      }
    }

    if(item.EBTag == 20){
      if (existingRecord) {
        await updateISBN(item);
      } else {
        await insertISBN(item);
      }
    }

    if(item.EBTag == 260){
      if (existingRecord) {
        await updateImprint(item);
      } else {
        await insertImprint(item);
      }
    }

    if(item.EBTag == 300){
      if (existingRecord) {
        await updatePhysical(item);
      } else {
        await insertPhysical(item);
      }
    }

    if(item.EBTag == 930){
      if (existingRecord) {
        await updatePublicationType(item);
      } else {
        await insertPublicationType(item);
      }
    }

    if(item.EBTag == 850){
      if (existingRecord) {
        await updateLic(item);
      } else {
        await insertLic(item);
      }
    }

    if(item.EBInd == 4 && item.EBTag == 650){
      await updateSubject(item);
    }

    if(item.EBInd == 0 && item.EBTag == 700){
      await updateAdditionalAuthors(item);
    }

    
  }

  }

} catch (error) {
  console.error(`Job ${job.id} failed with error:`, error);
  throw error; // Ensure job failure is propagated
}


}, { connection });


const checkExistingRecord = async (mainID) => {
  let connection1;
  try {
    connection1 = await connectionMysql.getConnection();
    const [rows] = await connection1.query('SELECT * FROM books WHERE bookId = ?', [mainID]);
    return rows.length > 0;
  } catch (error) {
    throw error;
  } finally {
    if (connection1) connection1.release();
  }
};

const updateNote = async (mainID) => {
  const pool = await poolPromise; // Ensure the pool is defined and connected
  const result = await pool.request()
    .query(`
      SELECT NteRaw
      FROM ENte
      WHERE NteTag = 500 AND NteBibId = ${mainID};
    `);
  
  // Assuming the result contains a single record and NteRaw is the field you need
  return result.recordset.length > 0 ? result.recordset[0].NteRaw.replace(/\\[abc]/g, '') : null;
}

const updatePdf = async (mainID) => {
  const pool = await poolPromise; // Ensure the pool is defined and connected
  const result = await pool.request()
    .query(`
      SELECT *
      FROM EMm
      WHERE MmBibId = ${mainID};
    `);

    const records = result.recordset;

    if (records.length > 0) {

      console.log(`Processing PDF `);

      const connection = await connectionMysql.getConnection();

      const deleteQuery = `
      DELETE FROM pdfBook
      WHERE bookId = ?
      `;
      await connection.query(deleteQuery, [mainID]);

      try {
        await connection.beginTransaction();

        // Loop through each record and insert into pdfBook table in MySQL
        for (const record of records) {

          let typePdfx = '';
          let urlPdf = '';
          // Check different values of MmGrp and set typePdfx accordingly
          if (record.MmGrp === 'Pre') {
            typePdfx = 1;
          } else if (record.MmGrp === 'ft') {
            typePdfx = 5;
          } else if (record.MmGrp === 'ab') {
            typePdfx = 2;
          } else if (record.MmGrp === 'ej') {
            typePdfx = 6;
          } else if (record.MmGrp === 'eb') {
            typePdfx = 7;
          } else if (record.MmGrp === 'TOF') {
            typePdfx = 4;
          } else if (record.MmGrp === 'ES') {
            typePdfx = 3;
          }

          urlPdf = `https://www.kpi-lib.com/elib/cgi-bin/opacexe.exe?op=mmvw&db=Main&skin=s&mmid=${record.MmId}&bid=${mainID}`;

          await connection.query(`
            INSERT INTO pdfBook (bookId, pdfName, type, MmId, urlPdf)
            VALUES (?, ?, ?, ?, ?)
          `, [mainID, record.MmFilename, typePdfx, record.MmId, urlPdf]); // Replace 'defaultType' with the appropriate value
        }

        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    }
  
  // Assuming the result contains a single record and NteRaw is the field you need
  return null;
}

const updateCitem = async (mainID, CallNumber) => {
  const pool = await poolPromise; // Ensure the pool is defined and connected
  const result = await pool.request()
    .query(`
      SELECT CItem.*, CItemClass.*
      FROM CItem
      JOIN CItemClass ON CItem.ItemClss = CItemClass.Class
      WHERE CItem.ItemBib = ${mainID};
    `);

    const records = result.recordset;

    if (records.length > 0) {

      console.log(`Processing PDF `);

      const connection = await connectionMysql.getConnection();

      const deleteQuery = `
      DELETE FROM bookItem
      WHERE bookId = ?
      `;
      await connection.query(deleteQuery, [mainID]);

      try {
        await connection.beginTransaction();

        // Loop through each record and insert into pdfBook table in MySQL
        for (const record of records) {

          await connection.query(`
            INSERT INTO bookItem (ItemNo, bookId, Cmponent, CallNumber, BookCategory)
            VALUES (?, ?, ?, ?, ?)
          `, [record.ItemNo, mainID, record.Cmponent, CallNumber, record.Desc]); // Replace 'defaultType' with the appropriate value
        }

        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    }
  
  // Assuming the result contains a single record and NteRaw is the field you need
  return null;
}

const insertData = async (item) => {
  let connection1;
  try {
    connection1 = await connectionMysql.getConnection();
    await connection1.beginTransaction();
    const { mainID, CallNumber, bookName, Book_Content, CvrFilename, EntrDate } = item;
    const createdAt = new Date(); // Current timestamp for createdAt
    const updatedAt = new Date(); // Current timestamp for updatedAt

    const note = await updateNote(mainID); // Correctly await the updateNote function

    const addPdf = await updatePdf(mainID);
    const upCitem = await updateCitem(mainID, CallNumber);

    const query = `
      INSERT INTO books (bookId, CallNumber, bookName, bookContent, image, note, EntrDate, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await connection1.query(query, [mainID, CallNumber, bookName, Book_Content, CvrFilename, note, EntrDate, createdAt, updatedAt]);
    await connection1.commit();
  } catch (error) {
    await connection1.rollback();
    throw error;
  } finally {
    if (connection1) connection1.release();
  }
};

const updateData = async (item) => {
  let connection1;
  try {
    connection1 = await connectionMysql.getConnection();
    await connection1.beginTransaction(); // Begin transaction

    const { mainID, CallNumber, bookName, Book_Content, CvrFilename, EntrDate } = item;
    const updatedAt = new Date(); // Current timestamp for updatedAt
    const note = await updateNote(mainID);
    const addPdf = await updatePdf(mainID);
    const upCitem = await updateCitem(mainID, CallNumber);

    const query = `
      UPDATE books
      SET CallNumber = ?, bookName = ?, updatedAt = ?, bookContent = ?, image = ?, note = ?, EntrDate = ?
      WHERE bookId = ?
    `;

    await connection1.query(query, [CallNumber, bookName, updatedAt, Book_Content, CvrFilename, note, EntrDate, mainID ]); // Execute update query

    await connection1.commit(); // Commit transaction
  } catch (error) {
    if (connection1) {
      await connection1.rollback(); // Rollback transaction on error
    }
    throw error; // Throw the error for handling in the calling function
  } finally {
    if (connection1) {
      connection1.release(); // Release the connection back to the pool
    }
  }
};

const insertNameEn = async (item) => {
  let connection1;
  try {
    connection1 = await connectionMysql.getConnection();
    await connection1.beginTransaction();
    const { mainID, CallNumber, bookName } = item;
    const createdAt = new Date(); // Current timestamp for createdAt
    const updatedAt = new Date(); // Current timestamp for updatedAt
    const query = `
      INSERT INTO books (bookId, bookNameEn, createdAt, updatedAt)
      VALUES (?, ?, ?, ?)
    `;
    await connection1.query(query, [mainID, bookName, createdAt, updatedAt]);
    await connection1.commit();
  } catch (error) {
    await connection1.rollback();
    throw error;
  } finally {
    if (connection1) connection1.release();
  }
};

const updateNameEn = async (item) => {
  let connection1;
  try {
    connection1 = await connectionMysql.getConnection();
    await connection1.beginTransaction(); // Begin transaction
    const { mainID, bookName } = item;
    const updatedAt = new Date(); // Current timestamp for updatedAt

    const query = `
      UPDATE books
      SET bookNameEn = ?, updatedAt = ?
      WHERE bookId = ?
    `;

    await connection1.query(query, [bookName, updatedAt, mainID]); // Execute update query
    await connection1.commit(); // Commit transaction
  } catch (error) {
    if (connection1) {
      await connection1.rollback(); // Rollback transaction on error
    }
    throw error; // Throw the error for handling in the calling function
  } finally {
    if (connection1) {
      connection1.release(); // Release the connection back to the pool
    }
  }
};

const insertEbook = async (item) => {
  let connection1;
  try {
    connection1 = await connectionMysql.getConnection();
    await connection1.beginTransaction();
    const { mainID, CallNumber, bookName } = item;
    const createdAt = new Date(); // Current timestamp for createdAt
    const updatedAt = new Date(); // Current timestamp for updatedAt
    const query = `
      INSERT INTO books (bookId, ebook, createdAt, updatedAt)
      VALUES (?, ?, ?, ?)
    `;
    await connection1.query(query, [mainID, bookName, createdAt, updatedAt]);
    await connection1.commit();
  } catch (error) {
    await connection1.rollback();
    throw error;
  } finally {
    if (connection1) connection1.release();
  }
};

const updateEbook = async (item) => {
  let connection1;
  try {
    connection1 = await connectionMysql.getConnection();
    await connection1.beginTransaction(); // Begin transaction
    const { mainID, bookName } = item;
    const updatedAt = new Date(); // Current timestamp for updatedAt

    const query = `
      UPDATE books
      SET ebook = ?, updatedAt = ?
      WHERE bookId = ?
    `;

    await connection1.query(query, [bookName, updatedAt, mainID]); // Execute update query
    await connection1.commit(); // Commit transaction
  } catch (error) {
    if (connection1) {
      await connection1.rollback(); // Rollback transaction on error
    }
    throw error; // Throw the error for handling in the calling function
  } finally {
    if (connection1) {
      connection1.release(); // Release the connection back to the pool
    }
  }
};

const insertAuthor = async (item) => {
  let connection1;
  try {
    connection1 = await connectionMysql.getConnection();
    await connection1.beginTransaction();
    const { mainID, CallNumber, bookName } = item;
    const createdAt = new Date(); // Current timestamp for createdAt
    const updatedAt = new Date(); // Current timestamp for updatedAt
    const query = `
      INSERT INTO books (bookId, bookAuthor, createdAt, updatedAt)
      VALUES (?, ?, ?, ?)
    `;
    await connection1.query(query, [mainID, bookName, createdAt, updatedAt]);
    await connection1.commit();
  } catch (error) {
    await connection1.rollback();
    throw error;
  } finally {
    if (connection1) connection1.release();
  }
};

const updateAuthor = async (item) => {
  let connection1;
  try {
    connection1 = await connectionMysql.getConnection();
    await connection1.beginTransaction(); // Begin transaction
    const { mainID, bookName } = item;
    const updatedAt = new Date(); // Current timestamp for updatedAt

    const query = `
      UPDATE books
      SET bookAuthor = ?, updatedAt = ?
      WHERE bookId = ?
    `;

    await connection1.query(query, [bookName, updatedAt, mainID]); // Execute update query
    await connection1.commit(); // Commit transaction
  } catch (error) {
    if (connection1) {
      await connection1.rollback(); // Rollback transaction on error
    }
    throw error; // Throw the error for handling in the calling function
  } finally {
    if (connection1) {
      connection1.release(); // Release the connection back to the pool
    }
  }
};

const insertISBN = async (item) => {
  let connection1;
  try {
    connection1 = await connectionMysql.getConnection();
    await connection1.beginTransaction();
    const { mainID, CallNumber, bookName } = item;
    const createdAt = new Date(); // Current timestamp for createdAt
    const updatedAt = new Date(); // Current timestamp for updatedAt
    const query = `
      INSERT INTO books (bookId, isbn, createdAt, updatedAt)
      VALUES (?, ?, ?, ?)
    `;
    await connection1.query(query, [mainID, bookName, createdAt, updatedAt]);
    await connection1.commit();
  } catch (error) {
    await connection1.rollback();
    throw error;
  } finally {
    if (connection1) connection1.release();
  }
};

const updateISBN = async (item) => {
  let connection1;
  try {
    connection1 = await connectionMysql.getConnection();
    await connection1.beginTransaction(); // Begin transaction
    const { mainID, bookName } = item;
    const updatedAt = new Date(); // Current timestamp for updatedAt

    const query = `
      UPDATE books
      SET isbn = ?, updatedAt = ?
      WHERE bookId = ?
    `;

    await connection1.query(query, [bookName, updatedAt, mainID]); // Execute update query
    await connection1.commit(); // Commit transaction
  } catch (error) {
    if (connection1) {
      await connection1.rollback(); // Rollback transaction on error
    }
    throw error; // Throw the error for handling in the calling function
  } finally {
    if (connection1) {
      connection1.release(); // Release the connection back to the pool
    }
  }
};

const insertImprint = async (item) => {
  let connection1;
  try {
    connection1 = await connectionMysql.getConnection();
    await connection1.beginTransaction();
    const { mainID, CallNumber, bookName } = item;
    const createdAt = new Date(); // Current timestamp for createdAt
    const updatedAt = new Date(); // Current timestamp for updatedAt
    const query = `
      INSERT INTO books (bookId, ImPrint, createdAt, updatedAt)
      VALUES (?, ?, ?, ?)
    `;
    await connection1.query(query, [mainID, bookName, createdAt, updatedAt]);
    await connection1.commit();
  } catch (error) {
    await connection1.rollback();
    throw error;
  } finally {
    if (connection1) connection1.release();
  }
};

const updateImprint = async (item) => {
  let connection1;
  try {
    connection1 = await connectionMysql.getConnection();
    await connection1.beginTransaction(); // Begin transaction
    const { mainID, bookName } = item;
    const updatedAt = new Date(); // Current timestamp for updatedAt

    const query = `
      UPDATE books
      SET ImPrint = ?, updatedAt = ?
      WHERE bookId = ?
    `;

    await connection1.query(query, [bookName, updatedAt, mainID]); // Execute update query
    await connection1.commit(); // Commit transaction
  } catch (error) {
    if (connection1) {
      await connection1.rollback(); // Rollback transaction on error
    }
    throw error; // Throw the error for handling in the calling function
  } finally {
    if (connection1) {
      connection1.release(); // Release the connection back to the pool
    }
  }
};

const insertPhysical = async (item) => {
  let connection1;
  try {
    connection1 = await connectionMysql.getConnection();
    await connection1.beginTransaction();
    const { mainID, CallNumber, bookName } = item;
    const createdAt = new Date(); // Current timestamp for createdAt
    const updatedAt = new Date(); // Current timestamp for updatedAt
    const query = `
      INSERT INTO books (bookId, physical, createdAt, updatedAt)
      VALUES (?, ?, ?, ?)
    `;
    await connection1.query(query, [mainID, bookName, createdAt, updatedAt]);
    await connection1.commit();
  } catch (error) {
    await connection1.rollback();
    throw error;
  } finally {
    if (connection1) connection1.release();
  }
};

const updatePhysical = async (item) => {
  let connection1;
  try {
    connection1 = await connectionMysql.getConnection();
    await connection1.beginTransaction(); // Begin transaction
    const { mainID, bookName } = item;
    const updatedAt = new Date(); // Current timestamp for updatedAt

    const query = `
      UPDATE books
      SET physical = ?, updatedAt = ?
      WHERE bookId = ?
    `;

    await connection1.query(query, [bookName, updatedAt, mainID]); // Execute update query
    await connection1.commit(); // Commit transaction
  } catch (error) {
    if (connection1) {
      await connection1.rollback(); // Rollback transaction on error
    }
    throw error; // Throw the error for handling in the calling function
  } finally {
    if (connection1) {
      connection1.release(); // Release the connection back to the pool
    }
  }
};

const insertPublicationType = async (item) => {
  let connection1;
  try {
    connection1 = await connectionMysql.getConnection();
    await connection1.beginTransaction();
    const { mainID, CallNumber, bookName, EBEtcId } = item;
    const createdAt = new Date(); // Current timestamp for createdAt
    const updatedAt = new Date(); // Current timestamp for updatedAt

    let collectionID = 8;

    if(EBEtcId == 44){
      collectionID = 3;
    }
    if(EBEtcId == 35798){
      collectionID = 1;
    }
    if(EBEtcId == 28){
      collectionID = 2;
    }
    if(EBEtcId == 1590){
      collectionID = 4;
    }
    if(EBEtcId == 1501){
      collectionID = 5;
    }
    if(EBEtcId == 8090){
      collectionID = 6;
    }
    if(EBEtcId == 29){
      collectionID = 7;
    }
    if(EBEtcId == 1534){
      collectionID = 9;
    }
    if(EBEtcId == 34153415){
      collectionID = 10;
    }

    const query = `
      INSERT INTO books (bookId, PublicationType, collectionID, createdAt, updatedAt)
      VALUES (?, ?, ?, ?)
    `;
    await connection1.query(query, [mainID, bookName, collectionID, createdAt, updatedAt]);
    await connection1.commit();
  } catch (error) {
    await connection1.rollback();
    throw error;
  } finally {
    if (connection1) connection1.release();
  }
};

const updatePublicationType = async (item) => {
  let connection1;
  try {
    connection1 = await connectionMysql.getConnection();
    await connection1.beginTransaction(); // Begin transaction
    const { mainID, bookName, EBEtcId } = item;
    const updatedAt = new Date(); // Current timestamp for updatedAt

    let collectionID = 8;

    if(EBEtcId == 44){
      collectionID = 3;
    }
    if(EBEtcId == 35798){
      collectionID = 1;
    }
    if(EBEtcId == 28){
      collectionID = 2;
    }
    if(EBEtcId == 1590){
      collectionID = 4;
    }
    if(EBEtcId == 1501){
      collectionID = 5;
    }
    if(EBEtcId == 8090){
      collectionID = 6;
    }
    if(EBEtcId == 29){
      collectionID = 7;
    }
    if(EBEtcId == 1534){
      collectionID = 9;
    }
    if(EBEtcId == 34153415){
      collectionID = 10;
    }

    const query = `
      UPDATE books
      SET PublicationType = ?, collectionID = ?, updatedAt = ?
      WHERE bookId = ?
    `;

    await connection1.query(query, [bookName, collectionID, updatedAt, mainID]); // Execute update query
    await connection1.commit(); // Commit transaction
  } catch (error) {
    if (connection1) {
      await connection1.rollback(); // Rollback transaction on error
    }
    throw error; // Throw the error for handling in the calling function
  } finally {
    if (connection1) {
      connection1.release(); // Release the connection back to the pool
    }
  }
};

const insertLic = async (item) => {
  let connection1;
  try {
    connection1 = await connectionMysql.getConnection();
    await connection1.beginTransaction();
    const { mainID, CallNumber, bookName } = item;
    const createdAt = new Date(); // Current timestamp for createdAt
    const updatedAt = new Date(); // Current timestamp for updatedAt
    const query = `
      INSERT INTO books (bookId, CurrentEditionAvailable, createdAt, updatedAt)
      VALUES (?, ?, ?, ?)
    `;
    await connection1.query(query, [mainID, bookName, createdAt, updatedAt]);
    await connection1.commit();
  } catch (error) {
    await connection1.rollback();
    throw error;
  } finally {
    if (connection1) connection1.release();
  }
};

const updateLic = async (item) => {
  let connection1;
  try {
    connection1 = await connectionMysql.getConnection();
    await connection1.beginTransaction(); // Begin transaction
    const { mainID, bookName } = item;
    const updatedAt = new Date(); // Current timestamp for updatedAt

    const query = `
      UPDATE books
      SET CurrentEditionAvailable = ?, updatedAt = ?
      WHERE bookId = ?
    `;

    await connection1.query(query, [bookName, updatedAt, mainID]); // Execute update query
    await connection1.commit(); // Commit transaction
  } catch (error) {
    if (connection1) {
      await connection1.rollback(); // Rollback transaction on error
    }
    throw error; // Throw the error for handling in the calling function
  } finally {
    if (connection1) {
      connection1.release(); // Release the connection back to the pool
    }
  }
};

const updateSubject = async (item) => {
  let connection1;
  try {
    connection1 = await connectionMysql.getConnection();
    await connection1.beginTransaction();
    
    const { mainID, EtcCnt, bookName } = item;
    const createdAt = new Date(); // Current timestamp for createdAt
    const updatedAt = new Date(); // Current timestamp for updatedAt
    
    // Delete existing records based on conditions
    const deleteQuery = `
      DELETE FROM subject
      WHERE bookId = ? AND name = ?
    `;
    await connection1.query(deleteQuery, [mainID, bookName]);

    // Insert new records
    const insertQuery = `
      INSERT INTO subject (bookId, SubCnt, name, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?)
    `;
    await connection1.query(insertQuery, [mainID, EtcCnt, bookName, createdAt, updatedAt]);

    await connection1.commit();
  } catch (error) {
    if (connection1) await connection1.rollback();
    throw error;
  } finally {
    if (connection1) connection1.release();
  }
};

const updateAdditionalAuthors = async (item) => {
  let connection1;
  try {
    connection1 = await connectionMysql.getConnection();
    await connection1.beginTransaction();
    
    const { mainID, EtcCnt, bookName } = item;
    const createdAt = new Date(); // Current timestamp for createdAt
    const updatedAt = new Date(); // Current timestamp for updatedAt
    
    // Delete existing records based on conditions
    const deleteQuery = `
      DELETE FROM AdditionalAuthors
      WHERE bookId = ? AND name = ?
    `;
    await connection1.query(deleteQuery, [mainID, bookName]);

    // Insert new records
    const insertQuery = `
      INSERT INTO AdditionalAuthors (bookId, EtcCnt, name, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?)
    `;
    await connection1.query(insertQuery, [mainID, EtcCnt, bookName, createdAt, updatedAt]);

    await connection1.commit();
  } catch (error) {
    if (connection1) await connection1.rollback();
    throw error;
  } finally {
    if (connection1) connection1.release();
  }
};

const updateRecommentBook = async (item) => {

  let connection1;
  try {
    connection1 = await connectionMysql.getConnection();
    await connection1.beginTransaction();
    
    const { BibId, RecOrd, RecStart, UpdtDate } = item;
    // Delete existing records based on conditions
    const deleteQuery = `
      DELETE FROM RecommentBook
      WHERE bookId = ?
    `;
    await connection1.query(deleteQuery, [BibId]);

    // Insert new records
    const insertQuery = `
      INSERT INTO RecommentBook (bookId, sortby, RecStart, UpdtDate)
      VALUES (?, ?, ?, ?)
    `;
    await connection1.query(insertQuery, [BibId, RecOrd, RecStart, UpdtDate]);

    await connection1.commit();
  } catch (error) {
    if (connection1) await connection1.rollback();
    throw error;
  } finally {
    if (connection1) connection1.release();
  }

};

const updateTopBook = async (item) => {


  let connection1;
  try {
    connection1 = await connectionMysql.getConnection();
    await connection1.beginTransaction();
    
    const { ItemBib, ItemNo, TotalCount } = item;
    // Insert new records
    const insertQuery = `
      INSERT INTO TopBook (bookId, ItemNo, TotalCount)
      VALUES (?, ?, ?)
    `;
    await connection1.query(insertQuery, [ItemBib, ItemNo, TotalCount]);

    await connection1.commit();
  } catch (error) {
    if (connection1) await connection1.rollback();
    throw error;
  } finally {
    if (connection1) connection1.release();
  }

}


function formatImageName(imageName) {
  // Extract the numeric part of the image name, assuming it does not include the file extension
  const numericPart = imageName.substring(0, imageName.lastIndexOf('.'));
  const fileExtension = imageName.substring(imageName.lastIndexOf('.'));

  // Format the numeric part with slashes
  const formattedPart = `https://kpi-lib.com/multim/www-cover/Main/${numericPart.substring(0, 3)}/${numericPart.substring(3, 6)}/${imageName}`;

  // Combine the formatted part with the file extension
  return formattedPart;
}

// จัดการการเสร็จสิ้นงาน
worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed with result:`, job.returnvalue);
});

// จัดการการล้มเหลวของงาน
worker.on('failed', (job, err) => {
  console.log(`Job ${job.id} failed with error:`, err);
});

module.exports = jobQueue;