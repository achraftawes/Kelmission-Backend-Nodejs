const express = require('express');
const db = require('../db');
const authenticateToken = require('../middlewares/authentication');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const pool = new Pool();
const { body, validationResult } = require('express-validator');
const router = express.Router();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // Set the destination path to store uploaded files in the 'uploads' directory
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});
const upload = multer({ storage: storage });




router.post('/add_job', authenticateToken, async (req, res) => {
  try {
    const { mail, num, speciality, description, titles, user_id, company_name } = req.body;

    // Check if the company already exists
    const selectCompanyQuery = `
      SELECT company_id FROM company WHERE name = $1
    `;

    const companyResult = await db.query(selectCompanyQuery, [company_name]);

    let company_id;

    if (companyResult.rows.length === 0) {
      // Create a new company if it doesn't exist
      const insertCompanyQuery = `
        INSERT INTO company (name)
        VALUES ($1)
        RETURNING company_id
      `;

      const newCompanyResult = await db.query(insertCompanyQuery, [company_name]);
      company_id = newCompanyResult.rows[0].company_id;
    } else {
      company_id = companyResult.rows[0].company_id;
    }

    // Insert the job into the database with the current date
    const insertJobQuery = `
      INSERT INTO job (mail, num, speciality, description, titles, user_id, company_id, date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING job_id
    `;

    const { rows } = await db.query(insertJobQuery, [mail, num, speciality, description, titles, user_id, company_id]);

    const job_id = rows[0].job_id;
    res.status(201).json({ job_id });
  } catch (error) {
    console.error('Error creating job:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});


router.get('/get_jobs', async (req, res) => {
  try {
    const selectAllJobsQuery = `
      SELECT job.*, 
      company.name AS company_name 
      FROM job
      INNER JOIN company ON job.company_id = company.company_id
      ORDER BY job.date DESC
    `;
    const { rows } = await db.query(selectAllJobsQuery);
    res.status(200).json(rows);
  } catch (error) {
    console.error('Error retrieving jobs:', error);
    console.error('SQL Query:', selectAllJobsQuery); // Add this line to log the SQL query
    res.status(500).json({ error: 'An error occurred' });
  }
});

router.get('/get_job/:job_id', async (req, res) => {
  try {
    const { job_id } = req.params;

    const selectJobQuery = `
    SELECT job.*, 
    company.name AS company_name 
    FROM job
    INNER JOIN company ON job.company_id = company.company_id
    WHERE job.job_id = $1
    `;
    const { rows } = await db.query(selectJobQuery, [job_id]);

    if (rows.length === 0) {
      console.error(`No job found with job_id: ${job_id}`);
      return res.status(404).json({ error: 'Job not found' });
    }

    const job = rows[0];
    res.status(200).json(job);
  } catch (error) {
    console.error('Error retrieving job:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});




// Delete a single job by job_id (Accessible only by admin)
router.post('/delete_job', authenticateToken, async (req, res) => {
  try {
    const { job_id } = req.body;
    const { role } = req.user; // Access the authenticated user's role from the request object

    if (role !== 1) {
      return res.status(403).json({ error: 'Access denied. This route is only accessible by admin users.' });
    }

    const deleteJobQuery = `
      DELETE FROM job WHERE job_id = $1
    `;
    await db.query(deleteJobQuery, [job_id]);

    res.status(200).json({ message: 'Job deleted successfully' });
  } catch (error) {
    console.error('Error deleting job:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});



// Create a new job
router.post('/create_job', authenticateToken, async (req, res) => {
  try {
    const { mail, date, num, speciality, company_id, category_id, user_id } = req.body;

    const insertJobQuery = `
      INSERT INTO job (mail, date, num, speciality, company_id, category_id, user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING job_id
    `;

    const { rows } = await db.query(insertJobQuery, [mail, date, num, speciality, company_id, category_id, user_id]);

    const job_id = rows[0].job_id;
    res.status(201).json({ job_id });
  } catch (error) {
    console.error('Error creating job:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

router.post('/add_to_favorites', authenticateToken, async (req, res) => {
  try {
    const { job_id } = req.body;
    const { userId } = req.user; // Use the correct property name (userId) here

    // Check if the job exists (you may have already checked this before, so it's optional to check again here)
    const selectJobQuery = `
      SELECT * FROM job WHERE job_id = $1
    `;
    const { rows } = await db.query(selectJobQuery, [job_id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Add the job to the user's favorites
    const insertFavoriteQuery = `
      INSERT INTO favoris (user_id, job_id, date_added)
      VALUES ($1, $2, NOW())
    `;
    await db.query(insertFavoriteQuery, [userId, job_id]); // Use the userId variable here

    res.status(200).json({ message: 'Job added to favorites successfully' });
  } catch (error) {
    console.error('Error adding job to favorites:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

router.get('/get_favorites', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.user; // Use the correct property name (userId) here

    // Fetch the favorite jobs for the user
    const selectFavoritesQuery = `
      SELECT job.* FROM favoris
      INNER JOIN job ON favoris.job_id = job.job_id
      WHERE favoris.user_id = $1
    `;
    const { rows } = await db.query(selectFavoritesQuery, [userId]);

    res.status(200).json({ favorites: rows });
  } catch (error) {
    console.error('Error fetching favorite jobs:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

router.get('/get_favorites/:user_id', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.params; // Get the user_id from the URL parameters

    // Fetch the favorite jobs for the user with the specified user_id
    const selectFavoritesQuery = `
      SELECT job.* FROM favoris
      INNER JOIN job ON favoris.job_id = job.job_id
      WHERE favoris.user_id = $1
    `;
    const { rows } = await db.query(selectFavoritesQuery, [user_id]);

    res.status(200).json({ favorites: rows });
  } catch (error) {
    console.error('Error fetching favorite jobs:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

router.get('/get_job_favorites/:job_id', async (req, res) => {
  try {
    const { job_id } = req.params;

    // Query the database to retrieve all the users who have marked the specified job as their favorite
    const getJobFavoritesQuery = `
      SELECT favoris.user_id, users.name AS user_name
      FROM favoris
      INNER JOIN users ON favoris.user_id = users.user_id
      WHERE favoris.job_id = $1
    `;

    const { rows } = await db.query(getJobFavoritesQuery, [job_id]);
    res.status(200).json(rows);
  } catch (error) {
    console.error('Error retrieving job favorites:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

router.get('/get_all_favorites', authenticateToken, async (req, res) => {
  try {
    const { role } = req.user; // Use the correct property name (role) here

    // Check if the user is an admin (role = 1)
    if (role !== 1) {
      return res.status(403).json({ error: 'Access denied. Only admin users can access all favorites.' });
    }

    // Fetch all favorite jobs without filtering by user_id
    const selectAllFavoritesQuery = `
      SELECT favoris.*, job.titles
      FROM favoris
      INNER JOIN job ON favoris.job_id = job.job_id
    `;
    const { rows } = await db.query(selectAllFavoritesQuery);

    res.status(200).json({ allFavorites: rows });
  } catch (error) {
    console.error('Error fetching all favorite jobs:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});


// Apply to a job
// Apply to a job
router.post('/apply_to_job', authenticateToken, async (req, res) => {
  try {
    const { job_id } = req.body;
    const { userId } = req.user; // Use the correct property name (userId) here

    // Check if the job exists (you may have already checked this before, so it's optional to check again here)
    const selectJobQuery = `
      SELECT * FROM job WHERE job_id = $1
    `;
    const { rows: jobRows } = await db.query(selectJobQuery, [job_id]);
    if (jobRows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Check if the user has already applied to this job
    const selectCandidatureQuery = `
      SELECT * FROM candidature WHERE job_id = $1 AND user_id = $2
    `;
    const { rows: candidatureRows } = await db.query(selectCandidatureQuery, [job_id, userId]);

    if (candidatureRows.length === 0) {
      // If the user has not applied before, create a new application in the candidature table
      const insertCandidatureQuery = `
        INSERT INTO candidature (date_applied, number_apply, job_id, user_id)
        VALUES (NOW(), 1, $1, $2)
      `;
      await db.query(insertCandidatureQuery, [job_id, userId]);
    } else {
      // If the user has already applied before, increment the number_apply field
      const updateCandidatureQuery = `
        UPDATE candidature SET number_apply = number_apply + 1 WHERE job_id = $1 AND user_id = $2
      `;
      await db.query(updateCandidatureQuery, [job_id, userId]);
    }

    res.status(200).json({ message: 'Applied to job successfully' });
  } catch (error) {
    console.error('Error applying to job:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

router.get('/get_user_applications', authenticateToken, async (req, res) => {
  try {
    const { userId, role } = req.user;

    // Check if the user is an admin (role = 1)
    if (role !== 1) {
      return res.status(403).json({ error: 'Access denied. Only admin users can access applications.' });
    }

    // Query the database to retrieve all job applications
    const getAllApplicationsQuery = `
      SELECT
        candidature.*,
        users.name AS user_name,
        job.titles AS job_title
      FROM candidature
      INNER JOIN users ON candidature.user_id = users.user_id
      INNER JOIN job ON candidature.job_id = job.job_id
    `;

    const { rows } = await db.query(getAllApplicationsQuery);
    res.status(200).json(rows);
  } catch (error) {
    console.error('Error retrieving job applications:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

// GET user applications by user_id
router.get('/get_user_applications/:user_id', authenticateToken, async (req, res) => {
  try {
    const { userId, role } = req.user;
    const { user_id } = req.params;

    // Check if the user is an admin (role = 1) or if the user is requesting their own applications
    if (role !== 1 && userId !== user_id) {
      return res.status(403).json({ error: 'Access denied. Only admin users can access applications for other users.' });
    }

    // Query the database to retrieve job applications for the specified user
    const getUserApplicationsQuery = `
      SELECT
        candidature.*,
        users.name AS user_name,
        job.titles AS job_title
      FROM candidature
      INNER JOIN users ON candidature.user_id = users.user_id
      INNER JOIN job ON candidature.job_id = job.job_id
      WHERE candidature.user_id = $1
    `;

    const { rows } = await db.query(getUserApplicationsQuery, [user_id]);
    res.status(200).json(rows);
  } catch (error) {
    console.error('Error retrieving user applications:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});


router.get('/get_job_applications/:job_id', async (req, res) => {
  try {
    const { job_id } = req.params;

    // Query the database to retrieve job applications for the specified job_id
    const getJobApplicationsQuery = `
      SELECT
        candidature.*,
        users.name AS user_name
      FROM candidature
      INNER JOIN users ON candidature.user_id = users.user_id
      WHERE candidature.job_id = $1
    `;

    const { rows } = await db.query(getJobApplicationsQuery, [job_id]);
    res.status(200).json(rows);
  } catch (error) {
    console.error('Error retrieving job applications:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});


router.post('/send_mail', upload.single('cvFile'), async (req, res) => {
  try {
    const { description, mail, email } = req.body;
    const cvFile = req.file ? req.file.filename : null; // Retrieve the uploaded filename or set it to null if no file was uploaded

    // Create a Nodemailer transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'kelmission7@gmail.com',
        pass: 'fqowuxylaoapbkhw'
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    // Function to send verification email
    async function sendVerificationEmail(mail, description, cvFile, email) {
      console.log('Recipient Email:', mail); // Log the recipient's email for debugging
      const mailOptions = {
        from: 'kelmission7@gmail.com',
        to: mail, // Set the recipient's email address
        subject: 'Apply for job',
        html: `
          <p>Good Morning,</p>
          <p>This is my mail : ${email}</p>
          <p>${description}</p>
          <p>Here is the CV File: <a href="http://localhost:3001/uploads/${cvFile}">Download CV</a></p>
        `
      };
    
      try {
        await transporter.sendMail(mailOptions);
        console.log('Mail sent successfully');
      } catch (error) {
        console.error('Error sending mail:', error);
        throw error;
      }
    }
    

    // Call the function to send the verification email
    await sendVerificationEmail(mail, description, cvFile, email);

    res.status(201).json({ message: 'Mail sent successfully' });
  } catch (error) {
    console.error('Error during mail sending:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

router.get('/comments/:job_id', async (req, res) => {
  try {
    const { job_id } = req.params;

    // Query the database to retrieve comments for the specified job_id
    const getCommentsQuery = `
    SELECT
  c.comment_id,
  c.user_id,
  c.comment_text,
  c.created_at,
  u.photo,
  cv.prenom AS user_prenom,
  cv.nom AS user_nom
FROM comments AS c
INNER JOIN cv ON c.user_id = cv.user_id
INNER JOIN users AS u ON c.user_id = u.user_id
WHERE c.job_id = $1
ORDER BY c.created_at DESC
    `;

    const { rows } = await db.query(getCommentsQuery, [job_id]);

    res.status(200).json(rows);
  } catch (error) {
    console.error('Error retrieving comments:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});
router.get('/all_comments', authenticateToken, async (req, res) => {
  try {
    const { userId, role } = req.user; // Use the correct property names (userId and role) here

    // Check if the user is an admin (role = 1)
    if (role !== 1) {
      return res.status(403).json({ error: 'Access denied. Only admin users can access all comments.' });
    }

    // Query the database to retrieve all comments
    const getAllCommentsQuery = `
      SELECT
        c.comment_id,
        c.user_id,
        c.comment_text,
        c.created_at,
        u.photo,
        cv.prenom AS user_prenom,
        cv.nom AS user_nom
      FROM comments AS c
      INNER JOIN cv ON c.user_id = cv.user_id
      INNER JOIN users AS u ON c.user_id = u.user_id
      ORDER BY c.created_at DESC
    `;

    const { rows } = await db.query(getAllCommentsQuery);

    res.status(200).json(rows);
  } catch (error) {
    console.error('Error retrieving all comments:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});
// Add comment route (your existing route)
router.post('/add_comment/:job_id', authenticateToken,  async (req, res) => {
  try {
    const { userId } = req.user;
    const {
      comment_text
    } = req.body;
    const { job_id } = req.params;
   

    // Insert the comment into the database, including the user_id and job_id
    const insertCommentQuery = `
      INSERT INTO comments (job_id, user_id, comment_text)
      VALUES ($1, $2, $3)
      RETURNING comment_id, created_at
    `;

    const { rows } = await db.query(insertCommentQuery, [job_id, userId, comment_text]);
    const commentId = rows[0].comment_id;
    res.status(201).json({ message: 'Comment added successfully', comment: rows[0] });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

router.post('/delete_comment', authenticateToken, async (req, res) => {
  try {
    const { comment_id } = req.body;
    const { role } = req.user; // Access the authenticated user's role from the request object

    // Check if the user is an admin (role = 1)
    if (role !== 1) {
      return res.status(403).json({ error: 'Access denied. This route is only accessible by admin users.' });
    }

    // Delete the comment from the database
    const deleteCommentQuery = `
      DELETE FROM comments WHERE comment_id = $1
    `;
    await db.query(deleteCommentQuery, [comment_id]);

    res.status(200).json({ message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

router.post('/save_message', async (req, res) => {
  try {
    const { names, email, phone_number, subject, message_text } = req.body;

    // Insert the message into the database
    const insertMessageQuery = `
      INSERT INTO messages (names, email, phone_number, subject, message_text, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING message_id
    `;

    const { rows } = await db.query(insertMessageQuery, [names, email, phone_number, subject, message_text]);
    const messageId = rows[0].message_id;
    
    res.status(201).json({ message: 'Message saved successfully', messageId });
    
  } catch (error) {
    console.error('Error saving message:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

router.get('/get_messages', authenticateToken, async (req, res) => {
  try {
    // Check if the user is authenticated
    if (!req.user || req.user.role !== 1) {
      return res.status(403).json({ error: 'Access denied. Only admin users can access messages.' });
    }

    // Query the database to retrieve messages
    const getMessagesQuery = `
      SELECT * FROM messages
      ORDER BY created_at DESC
    `;

    const { rows } = await db.query(getMessagesQuery);
    res.status(200).json(rows);
  } catch (error) {
    console.error('Error retrieving messages:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

router.post('/delete_message', authenticateToken, async (req, res) => {
  try {
    const { message_id } = req.body;
    const { role } = req.user; // Access the authenticated user's role from the request object

    if (role !== 1) {
      return res.status(403).json({ error: 'Access denied. Only admin users can delete messages.' });
    }

    const deleteMessageQuery = `
      DELETE FROM messages WHERE message_id = $1
    `;

    await db.query(deleteMessageQuery, [message_id]);

    res.status(200).json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

router.get('/get_logs', authenticateToken, async (req, res) => {
  try {
    // Check if the user is authenticated (adjust the condition as needed)
    if (!req.user || req.user.role !== 1) {
      return res.status(403).json({ error: 'Access denied. Only admin users can access logs.' });
    }

    // Query the database to retrieve log entries
    const getLogsQuery = `
      SELECT * FROM log
      ORDER BY date_log DESC
    `;

    const { rows } = await db.query(getLogsQuery);
    res.status(200).json(rows);
  } catch (error) {
    console.error('Error retrieving log entries:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

module.exports = router;
