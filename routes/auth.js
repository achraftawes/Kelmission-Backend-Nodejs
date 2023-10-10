const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');
const moment = require('moment');
const nodemailer = require('nodemailer');
const { EMAIL, PASSWORD } = require('../env');
const crypto = require('crypto');
const authenticateToken = require('../middlewares/authentication');
const multer = require('multer');

const router = express.Router();

// Set up storage for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // Choose the directory where you want to store the uploaded files
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname); // Set the filename to be unique by appending the current timestamp
  }
});

// Create the multer upload instance
const upload = multer({ storage: storage });

// Generate a verification token
function generateVerificationToken() {
  const token = crypto.randomBytes(20).toString('hex');
  return token;
}

function generateResetToken() {
  const token = crypto.randomBytes(20).toString('hex'); // Generate a random token
  return token;
}

router.post('/register', upload.single('photo'), async (req, res) => {
  try {
    const { name, email, password, motivation_letter } = req.body;
    const photo = req.file ? req.file.filename : null; // Retrieve the uploaded filename or set it to null if no file was uploaded

    // Check if email already exists in the database
    const emailExistsQuery = 'SELECT * FROM users WHERE email = $1';
    const { rows } = await db.query(emailExistsQuery, [email]);
    if (rows.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const insertUserQuery = `
      INSERT INTO users (name, email, password, motivation_letter, role, active, verified_email, date_inscription, verification_token, photo)
      VALUES ($1, $2, $3, $4, $5, true, false, $6, $7, $8)
    `;
    const registrationDate = moment().format(); // Get the current date and time

    const verificationToken = generateVerificationToken(); // Generate a verification token

    await db.query(insertUserQuery, [name, email, hashedPassword, motivation_letter, '0', registrationDate, verificationToken, photo]);

    // Create a Nodemailer transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: EMAIL,
        pass: PASSWORD
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    // Function to send verification email
    async function sendVerificationEmail(email, verificationToken) {
      const mailOptions = {
        from: 'achraf.tawes@esprit.tn', // Replace with your desired email address
        to: email,
        subject: 'Email Verification',
        html: `
          <p>Dear user,</p>
          <p>Thank you for registering. Please click the following link to verify your email:</p>
          <a href="http://localhost:3001/api/auth/verify/${verificationToken}">Verify Email</a>
        `
      };

      try {
        await transporter.sendMail(mailOptions);
        console.log('Verification email sent successfully');
      } catch (error) {
        console.error('Error sending verification email:', error);
        throw error;
      }
    }

    // Send verification email
    await sendVerificationEmail(email, verificationToken);

    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error('Error during user registration:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

// Verification endpoint
router.get('/verify/:verificationToken', async (req, res) => {
  try {
    const { verificationToken } = req.params;

    // Implement your logic to verify the token
    // For example, you can compare it with the token stored in the database for the user
    // Retrieve the user from the database based on the verificationToken
    const { rows } = await db.query('SELECT * FROM users WHERE verification_token = $1', [verificationToken]);
    const user = rows[0];

    if (!user) {
      // Handle the case when the verification token is not found or invalid
      return res.status(404).json({ error: 'Invalid verification token' });
    }

    // If the verification is successful, update the user's verified_email status in the database
    // For example, you can execute an UPDATE query to set verified_email to true
    await db.query('UPDATE users SET verified_email = true WHERE user_id = $1', [user.user_id]);

    // Return a response indicating the verification status
    res.status(200).json({ message: 'Email verified successfully' });
  } catch (error) {
    console.error('Error during email verification:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});



// User login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const selectUserQuery = `
      SELECT * FROM users WHERE email = $1
    `;
    const { rows } = await db.query(selectUserQuery, [email]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = rows[0];

    if (!user.verified_email) {
      return res.status(401).json({ error: 'Email not verified. Please verify your email before logging in.' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ userId: user.user_id, role: user.role }, 'your_secret_key');
    res.status(200).json({ token });
  } catch (error) {
    console.error('Error during user login:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

router.post('/request-password-reset', async (req, res) => {
  try {
    const { email } = req.body;

    // Check if the user exists in your database (you should have this query)
    const userQuery = `
      SELECT * FROM users
      WHERE email = $1
    `;
    const { rows } = await db.query(userQuery, [email]);
    const user = rows[0];

    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Generate and store a reset token with expiration time in your database
    const resetToken = generateResetToken(); // Use the generateResetToken function
    const resetTokenExpiration = new Date(Date.now() + 3600000); // 1 hour expiration

    const updateTokenQuery = `
      UPDATE users
      SET reset_token = $1, reset_token_expiration = $2
      WHERE user_id = $3
    `;
    await db.query(updateTokenQuery, [resetToken, resetTokenExpiration, user.user_id]);

    // Send an email to the user containing the reset link with the resetToken

    res.status(200).json({ message: 'Password reset instructions sent to your email.' });
  } catch (error) {
    console.error('Error during password reset request:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

// Reset password
router.post('/reset-password/:resetToken', async (req, res) => {
  try {
    const { resetToken } = req.params;
    const { newPassword } = req.body;

    // Check if the reset token is valid and not expired
    const checkResetTokenQuery = `
      SELECT * FROM users
      WHERE reset_token = $1
      AND reset_token_expiration > NOW()
    `;
    const { rows } = await db.query(checkResetTokenQuery, [resetToken]);
    const user = rows[0];

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    // Update the user's password with the new one
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const updatePasswordQuery = `
      UPDATE users
      SET password = $1, reset_token = NULL, reset_token_expiration = NULL
      WHERE user_id = $2
    `;
    await db.query(updatePasswordQuery, [hashedPassword, user.user_id]);

    // Return a response indicating that the password has been reset
    res.status(200).json({ message: 'Password reset successful' });
  } catch (error) {
    console.error('Error during password reset:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

router.get('/profile', authenticateToken, async (req, res) => {
  try {
    // Get the user ID and role from the request token
    const { userId, role } = req.user;

    let selectUserQuery;
    let selectUserParams;

    if (role === 1) {
      // If the user is an admin (role 1), fetch complete profile information
      selectUserQuery = `
  SELECT u.name, u.email, u.motivation_letter, u.date_inscription, u.role, u.photo, cv.nom, cv.prenom, cv.localisation, cv.work_experience, cv.education, cv.skills, cv.languages, cv.certifications_and_licenses, cv.links, cv.work_experience_duree, cv.education_duree, cv.profession,cv.facebook , cv.instagram , cv.twitter , cv.linkedin
  FROM users u
  LEFT JOIN cv ON u.cv_id = cv.cv_id
  WHERE u.user_id = $1
`;
      selectUserParams = [userId];
    } else {
      // If the user is not an admin, fetch limited profile information with CV
      selectUserQuery = `
  SELECT u.name, u.email, u.motivation_letter, u.date_inscription, u.role, u.photo, cv.nom, cv.prenom, cv.localisation, cv.work_experience, cv.education, cv.skills, cv.languages, cv.certifications_and_licenses, cv.links, cv.work_experience_duree, cv.education_duree, cv.profession,cv.facebook , cv.instagram , cv.twitter , cv.linkedin
  FROM users u
  LEFT JOIN cv ON u.cv_id = cv.cv_id
  WHERE u.user_id = $1
`;
      selectUserParams = [userId];
    }

    const { rows } = await db.query(selectUserQuery, selectUserParams);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const userProfile = rows[0];

    res.status(200).json(userProfile);
  } catch (error) {
    console.error('Error retrieving user profile:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

// Search users (admin kahaw)
router.get('/search', async (req, res) => {
  try {
    // Fetch all users from the database with additional CV information
    const selectAllUsersQuery = `
      SELECT
        u.*,
        cv.profession,
        cv.facebook,
        cv.twitter,
        cv.instagram,
        cv.linkedin,
        cv.nom,
        cv.prenom
      FROM users u
      LEFT JOIN cv ON u.cv_id = cv.cv_id
    `;
    
    const { rows } = await db.query(selectAllUsersQuery);

    res.status(200).json(rows);
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

// Update user profile

router.put('/profile', upload.single('photo'), authenticateToken, async (req, res) => {
  try {
    // Get the user ID from the request token
    const userId = req.user.userId;

    // Extract the updated profile data from the request body
    const { nom, prenom, email, localisation, work_experience, work_experience_duree, education, education_duree, skills, languages, certifications_and_licenses,links, motivation_letter, profession, facebook, instagram, twitter, linkedin } = req.body;

    // Get the existing photo from the database
    const selectUserQuery = `
      SELECT photo FROM users WHERE user_id = $1
    `;
    const { rows } = await db.query(selectUserQuery, [userId]);
    const existingPhoto = rows[0].photo;

    // Determine whether a new photo was uploaded or not
    const newPhoto = req.file ? req.file.filename : existingPhoto;

    // Update the user profile and CV in the database
    const updateUserQuery = `
          UPDATE users
          SET photo = $1,
              motivation_letter = $2
          WHERE user_id = $3
        `;
    await db.query(updateUserQuery, [newPhoto, motivation_letter, userId]);

    const updateCVQuery = `
  UPDATE cv
  SET localisation = $1,
      work_experience = $2,
      work_experience_duree = $3,
      education = $4,
      education_duree = $5,
      skills = $6,
      languages = $7,
      certifications_and_licenses = $8,
      links = $9,
      profession = $10,
      facebook = $11,
      instagram = $12,
      twitter = $13,
      linkedin = $14,
      nom = $15,
      prenom = $16
  WHERE user_id = $17
`;

// Pass the parameters in the correct order
await db.query(updateCVQuery, [
  localisation,
  work_experience,
  work_experience_duree,
  education,
  education_duree,
  skills,
  languages,
  certifications_and_licenses,
  links,
  profession,
  facebook,
  instagram,
  twitter,
  linkedin,
  nom,
  prenom,
  userId,
]);
    res.status(200).json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});



// Delete user profile
router.delete('/profile', authenticateToken, async (req, res) => {
  try {
    // Get the user ID from the request token
    const userId = req.user.userId;

    // Delete the user profile from the database
    const deleteProfileQuery = `
      DELETE FROM users WHERE user_id = $1
    `;
    await db.query(deleteProfileQuery, [userId]);

    res.status(200).json({ message: 'Profile deleted successfully' });
  } catch (error) {
    console.error('Error deleting user profile:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});



// Delete user (admin kahaw)
router.delete('/delete', authenticateToken, async (req, res) => {
  try {
    const { email } = req.body;
    const { role } = req.user;

    if (role !== 1) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Delete user from the database based on email
    const deleteUserQuery = `
      DELETE FROM users WHERE email = $1
    `;
    await db.query(deleteUserQuery, [email]);

    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

// Search users (admin kahaw)
router.get('/search', authenticateToken, async (req, res) => {
  try {
    // Fetch all users from the database
    const selectAllUsersQuery = `
      SELECT * FROM users
    `;
    const { rows } = await db.query(selectAllUsersQuery);

    res.status(200).json(rows);
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

// Search user by email (admin kahaw)
router.get('/search_user', authenticateToken, async (req, res) => {
  try {
    const { role } = req.user;

    if (role !== 1) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { email } = req.body;

    // Fetch the user from the database based on email
    const selectUserQuery = `
      SELECT * FROM users WHERE email = $1
    `;
    const { rows } = await db.query(selectUserQuery, [email]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = rows[0];

    res.status(200).json(user);
  } catch (error) {
    console.error('Error searching user:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});


router.get('/search_user/:user_id', authenticateToken, async (req, res) => {
  try {
    const { role } = req.user;

    if (role !== 1) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { user_id } = req.params;

    // Fetch the user and CV from the database based on user ID
    const selectUserQuery = `
      SELECT u.*, cv.*
      FROM users u
      LEFT JOIN cv ON u.cv_id = cv.cv_id
      WHERE u.user_id = $1
    `;
    const { rows } = await db.query(selectUserQuery, [user_id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = rows[0];

    res.status(200).json(user);
  } catch (error) {
    console.error('Error searching user:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});


// Update user role by email (admin kahaw)
router.put('/update-role', authenticateToken, async (req, res) => {
  try {
    // Get the user ID and role from the request token
    const { userId, role } = req.user;

    // Check if the user has an admin role (role = 1)
    if (role !== 1) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Get the email parameter from the request body
    const { email } = req.body;

    // Update the user role in the database based on email
    const updateRoleQuery = `
      UPDATE users SET role = '1' WHERE email = $1
    `;
    await db.query(updateRoleQuery, [email]);

    res.status(200).json({ message: 'User role updated successfully' });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

// Toggle user role by email (admin-only) mara 1 w mara 0 w nbadel enty wel click
router.put('/toggle-role', authenticateToken, async (req, res) => {
  try {
    // Get the user ID and role from the request token
    const { userId, role } = req.user;

    // Check if the user has an admin role (role = 1)
    if (role !== 1) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Get the email parameter from the request body
    const { email } = req.body;

    // Get the current role of the user from the database
    const getUserQuery = `
      SELECT role FROM users WHERE email = $1
    `;
    const { rows } = await db.query(getUserQuery, [email]);
    const currentRole = rows[0].role;

    // Determine the new role based on the current role
    const newRole = currentRole === 1 ? 0 : 1;

    // Update the user role in the database based on email
    const updateRoleQuery = `
      UPDATE users SET role = $1 WHERE email = $2
    `;
    await db.query(updateRoleQuery, [newRole, email]);

    res.status(200).json({ message: 'User role updated successfully' });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});
// Deactivate user account (admin-only)
router.put('/deactivate', authenticateToken, async (req, res) => {
  try {
    const { email } = req.body;
    const { role } = req.user;

    if (role !== 1) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Deactivate user account in the database based on email
    const deactivateUserQuery = `
      UPDATE users SET active = false WHERE email = $1
    `;
    await db.query(deactivateUserQuery, [email]);

    res.status(200).json({ message: 'User account deactivated successfully' });
  } catch (error) {
    console.error('Error deactivating user account:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

// Activate user account by email (admin kahaw)
router.put('/activate', authenticateToken, async (req, res) => {
  try {
    // Get the user ID and role from the request token
    const { userId, role } = req.user;

    // Check if the user has an admin role (role = 1)
    if (role !== 1) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Get the email from the request body
    const { email } = req.body;

    // Activate user account in the database based on email
    const activateUserQuery = `
      UPDATE users SET active = true WHERE email = $1
    `;
    await db.query(activateUserQuery, [email]);

    res.status(200).json({ message: 'User account activated successfully' });
  } catch (error) {
    console.error('Error activating user account:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

router.post('/logout', (req, res) => {
  try {
    
    res.clearCookie('jwtToken');

    res.status(200).json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Error during user logout:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

// User login
router.post('/admin-login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const selectUserQuery = `
      SELECT * FROM users WHERE email = $1
    `;
    const { rows } = await db.query(selectUserQuery, [email]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = rows[0];

    if (!user.verified_email) {
      return res.status(401).json({ error: 'Email not verified. Please verify your email before logging in.' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    if (user.role !== 1) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    const token = jwt.sign({ userId: user.user_id, role: user.role }, 'your_secret_key');
    res.status(200).json({ token });
  } catch (error) {
    console.error('Error during user login:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});




module.exports = router;