const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');
const authenticateToken = require('../middlewares/authentication');

const router = express.Router();

// Create a CV
router.post('/create_cv', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.user;
    const {
      nom,
      prenom,
      localisation,
      work_experience,
      work_experience_duree,
      education,
      education_duree,
      skills,
      languages,
      certifications_and_licenses,
      facebook, 
      twitter,  
      linkedin, 
      instagram, 
      profession,
      country,
    } = req.body;

    // Your code for splitting and formatting work_experience and work_experience_duree remains the same

    const insertCVQuery = `
      INSERT INTO cv (
        user_id,
        nom,
        prenom,
        localisation,
        work_experience,
        work_experience_duree,
        education,
        education_duree,
        skills,
        languages,
        certifications_and_licenses,
        facebook, 
        twitter,  
        linkedin, 
        instagram, 
        profession,
        country
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,$17)
      RETURNING cv_id
    `;

    const { rows } = await db.query(insertCVQuery, [
      userId,
      nom,
      prenom,
      localisation,
      work_experience,
      work_experience_duree,
      education,
      education_duree,
      skills,
      languages,
      certifications_and_licenses,
      facebook, 
      twitter,  
      linkedin, 
      instagram, 
      profession,
      country,
    ]);

    const cvId = rows[0].cv_id;

    const updateUserQuery = `
      UPDATE users
      SET cv_id = $1
      WHERE user_id = $2
    `;
    await db.query(updateUserQuery, [cvId, userId]);

    res.status(201).json({ cvId });
  } catch (error) {
    console.error('Error creating CV:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});


// Update CV
router.put('/update_cv/:cv_id', authenticateToken, async (req, res) => {
  try {
    const { cv_id } = req.params;
    const {
      nom,
      prenom,
      localisation,
      work_experience,
      work_experience_duree,
      education,
      education_duree,
      skills,
      languages,
      certifications_and_licenses,
      facebook, // Add 'facebook' field
      twitter,  // Add 'twitter' field
      linkedin, // Add 'linkedin' field
      instagram, // Add 'instagram' field
      profession,
      country,
    } = req.body;

    const updateCVQuery = `
      UPDATE cv
      SET
        nom = $1,
        prenom = $2,
        localisation = $3,
        work_experience = $4,
        work_experience_duree = $5,
        education = $6,
        education_duree = $7,
        skills = $8,
        languages = $9,
        certifications_and_licenses = $10,
        facebook = $11, 
        twitter = $12,  
        linkedin = $13, 
        instagram = $14, 
        profession = $15,
        country = $16
      WHERE cv_id = $17
    `;
    await db.query(updateCVQuery, [
      nom,
      prenom,
      localisation,
      work_experience,
      work_experience_duree,
      education,
      education_duree,
      skills,
      languages,
      certifications_and_licenses,
      facebook, 
      twitter,  
      linkedin, 
      instagram, 
      profession,
      country,
      cv_id,
    ]);

    res.status(200).json({ message: 'CV updated successfully' });
  } catch (error) {
    console.error('Error updating CV:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});


router.get('/check_cv', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.user;

    // Query the database or perform any necessary checks to determine if the user has a CV
    const userHasCV = await checkIfUserHasCV(userId);

    if (userHasCV) {
      // User has a CV
      res.status(200).json({ hasCV: true });
    } else {
      // User doesn't have a CV
      res.status(200).json({ hasCV: false });
    }
  } catch (error) {
    console.error('Error checking CV:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

async function checkIfUserHasCV(userId) {
  try {
    // Query the database to check if the user has a CV
    const query = 'SELECT * FROM cv WHERE user_id = $1';
    const { rows } = await db.query(query, [userId]);

    // If there are rows returned, it means the user has a CV
    // Otherwise, the user doesn't have a CV
    return rows.length > 0;
  } catch (error) {
    console.error('Error checking if user has CV:', error);
    // Handle the error as needed, for example, you might want to log the error
    throw error;
  }
}
  

router.get('/get_cv/:cv_id', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.user;
    const { cv_id } = req.params;

    const selectCVQuery = `
      SELECT * FROM cv WHERE user_id = $1 AND cv_id = $2
    `;
    const { rows } = await db.query(selectCVQuery, [userId, cv_id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'CV not found' });
    }
    const cv = rows[0];
    res.status(200).json(cv);
  } catch (error) {
    console.error('Error retrieving CV:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

// Get all CVs (only accessible by admin)
router.get('/get_all_cvs', authenticateToken, async (req, res) => {
    try {
      const { role } = req.user; // Access the authenticated user's role from the request object
      if (role !== 1) {
        return res.status(403).json({ error: 'Access denied. This route is only accessible by admin users.' });
      }
  
      const selectAllCVsQuery = `
        SELECT * FROM cv
      `;
      const { rows } = await db.query(selectAllCVsQuery);
      res.status(200).json(rows);
    } catch (error) {
      console.error('Error retrieving CVs:', error);
      res.status(500).json({ error: 'An error occurred' });
    }
});

// Delete CV
router.delete('/delete_cv', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.user; // Access the authenticated user's ID from the request object

    // Check if the CV exists for the authenticated user
    const selectCVQuery = `
      SELECT * FROM cv WHERE user_id = $1
    `;
    const { rows } = await db.query(selectCVQuery, [userId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'CV not found' });
    }

    // Update the user's cv_id to null in the users table before deleting the CV
    const updateUserQuery = `
      UPDATE users
      SET cv_id = NULL
      WHERE user_id = $1
    `;
    await db.query(updateUserQuery, [userId]);

    // Delete the CV
    const deleteCVQuery = `
      DELETE FROM cv WHERE user_id = $1
    `;
    await db.query(deleteCVQuery, [userId]);

    res.status(200).json({ message: 'CV deleted successfully' });
  } catch (error) {
    console.error('Error deleting CV:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});


module.exports = router;
