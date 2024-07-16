const express = require('express');
const router = express.Router();
const {
  sql,
  poolPromise
} = require('./dbPool');
const connectionMysql = require('./mysqlConfig');
const {
  addJob,
  addJob2,
  addJobrecomment,
  addJobTop
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

router.get('/Addrecomment', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`SELECT * FROM EBibRec`);
    await addJobrecomment(result.recordset);
    res.json(result.recordset);
  } catch (err) {
    console.error('Error fetching recommendations:', err);
    res.status(500).json({
      error: 'Internal Server Error'
    });
  }
});


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
         WHERE image IS NOT NULL AND image != '' 
         ORDER BY EntrDate DESC 
         LIMIT ? OFFSET ?`,
      [parseInt(pageSize), parseInt(offset)]
    );

    const response = [{
      totalBooks: pageSize,
      items: result
    }];

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
        SELECT DISTINCT b.*
        FROM books b
        INNER JOIN RecommentBook rb ON b.bookId = rb.bookId
        ORDER BY b.EntrDate DESC
        LIMIT ? OFFSET ?
      `, [pageSize, offset]);


    const [mytotalBooks] = await connection.query(`
        SELECT COUNT(DISTINCT b.bookId) as totalBooks
        FROM books b
        INNER JOIN RecommentBook rb ON b.bookId = rb.bookId
      `);

    const response = [{
      totalBooks: mytotalBooks,
      items: result
    }];

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
        SELECT DISTINCT b.*
        FROM books b
        INNER JOIN TopBook rb ON b.bookId = rb.bookId
        ORDER BY b.EntrDate DESC
        LIMIT ? OFFSET ?
      `, [pageSize, offset]);

    const [mytotalBooks] = await connection.query(`
        SELECT COUNT(DISTINCT b.bookId) as totalBooks
        FROM books b
        INNER JOIN TopBook rb ON b.bookId = rb.bookId
      `);

    const response = [{
      totalBooks: mytotalBooks,
      items: result
    }];

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
    // เพิ่มการนับจำนวนหนังสือสำหรับแต่ละคอลเลคชัน
    for (let i = 0; i < collections.length; i++) {
      const collection = collections[i];
      const [bookCountResult] = await connection.query('SELECT COUNT(*) AS count FROM books WHERE collectionID = ?', [collection.id]);
      collection.bookCount = bookCountResult[0].count;
    }
    res.json(collections);
  } catch (error) {
    console.error('Error fetching getCollection', error);
    res.status(500).json({
      error: 'Internal Server Error'
    });
  } finally {
    if (connection) connection.release();
  }

});


router.get('/getTop', async (req, res) => {
  try {
    const pool = await poolPromise;

    // Query to fetch top 40 records grouped by ItemNo
    const result = await pool.request().query(`
      SELECT TOP 40 CM.ItemNo, COUNT(*) AS TotalCount, CI.ItemBib
      FROM CMCirculation CM
      JOIN CItem CI ON CM.ItemNo = CI.ItemNo
      WHERE YEAR(CM.ChkODate) = 2024
      GROUP BY CM.ItemNo, CI.ItemBib
      ORDER BY TotalCount DESC
    `);

    if (result.recordset.length > 0) {
      await addJobTop(result.recordset);
    }

    res.json(result.TotalCount);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({
      error: 'Internal Server Error'
    });
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

    const result = await pool.request()
      .input('EBEtcId', 35798)
      .input('EBTag', 930)
      .query(`
        SELECT EBBibId
        FROM EEtcBib
        WHERE EBEtcId = @EBEtcId and EBTag = @EBTag;
      `);

    const bookIDs = result.recordset.map(row => row.EBBibId);

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
    //console.log(flattenedProcessedData);
    res.json(flattenedProcessedData);


    
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
      .input('pageSize', sql.Int, 0)
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


function formatImageName(imageName) {
  // Extract the numeric part of the image name, assuming it does not include the file extension
  const numericPart = imageName.substring(0, imageName.lastIndexOf('.'));
  const fileExtension = imageName.substring(imageName.lastIndexOf('.'));

  // Format the numeric part with slashes
  const formattedPart = `https://kpi-lib.com/multim/www-cover/Main/${numericPart.substring(0, 3)}/${numericPart.substring(3, 6)}/${imageName}`;

  // Combine the formatted part with the file extension
  return formattedPart;
}

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


    const response = [{
      totalBooks: totalBooks,
      items: formattedBooks
    }];

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

    const response = [{
      totalBooks: totalBooks,
      items: formattedBooks
    }];
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
      bookPdf: []
    };

    // Fetch subjects for the current book
    const [subjects] = await connection.query('SELECT * FROM subject WHERE bookId = ?', [book.bookId]);
    formattedBook.subjects = subjects.map(subject => ({
      SubCnt: subject.SubCnt,
      name: subject.name
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
      image: item.image // Add image to the bookItem
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

router.get('/kpibook-placeholder', async (req, res) => {
  const imagePath = path.join(__dirname, 'public/assets/image/kpibook-placeholder.jpg');
  res.sendFile(imagePath);
});

// Similar optimizations can be done for other routes...

module.exports = router;