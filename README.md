Article Publishing System

A full-stack Article Publishing System built as a practical assessment, demonstrating role-based workflows, review cycles, revision handling, and manual track-changes functionality using JavaScript.

Tech Stack
Frontend

React (Functional Components)

Vite

Tailwind CSS

React Router

Vanilla JavaScript for text selection & tracking changes (no editor diff)

Backend

Node.js

Express.js

JWT Authentication

RESTful API design

Database

Supabase PostgreSQL (Cloud SQL)

User Roles

Admin

Author

Reviewer

Each role has isolated permissions and dedicated workflows.

Core Features
Authentication

Login & Register for Admin, Author, Reviewer

Role-based access control (JWT)

Author

Create articles

Request revision for rejected articles

Edit article after revision approval

Admin

Accept or reject submitted articles

Assign articles to reviewers

Approve or reject revision requests

Review tracked changes between old and new article versions

Approve or reject each individual text change

Re-assign article to reviewer after approving all changes

Reviewer

Review assigned articles

Add comments by selecting text

Accept (publish) or reject articles

Track Changes (Mandatory Requirement)

Implemented using pure JavaScript

No editor-based diff tools used

Added / Removed / Same text highlighted

Admin can approve or reject every single change

Application Flow (High Level)

Author submits article → status PENDING

Admin accepts article → assigns to Reviewer

Reviewer reviews article and adds comments

Reviewer accepts or rejects:

Accept → article is PUBLISHED

Reject → article becomes REJECTED

Author requests revision

Admin approves revision request

Author edits article (stored as pending content)

Admin reviews tracked changes and approves/rejects each change

On approval of all changes → article is re-assigned to Reviewer

Reviewer reviews again and publishes

Project Approach

I approached this task by first setting up a clean, scalable, and well-structured frontend using React, Vite, and Tailwind CSS.
Early in the development, I focused on defining clear navigation and role-based pages (Admin, Author, Reviewer) to accurately reflect the real business workflow of an article publishing system.

After establishing the frontend flow, I incrementally integrated the backend using Express.js, applying proper REST API design, role-based access control, and clear separation of concerns. Special attention was given to implementing complex workflow logic such as article review cycles, revision handling, and state transitions.

One of the key challenges was implementing text selection, commenting, and JavaScript-based track changes without relying on an editor’s built-in diff features. This was solved by calculating text ranges dynamically and comparing article versions on the backend, allowing the Admin to approve or reject each individual change.

Notes & Known Issues
MongoDB Atlas (SRV DNS Resolution Issue)

Initially, I attempted to use MongoDB Atlas as a cloud NoSQL database. However, on my local network, the SRV DNS lookup required by mongodb+srv:// consistently failed with:

querySrv ECONNREFUSED _mongodb._tcp.<cluster>.mongodb.net


MongoDB Atlas users and permissions were configured correctly.

Network Access IP whitelist was enabled and verified.

The issue appears to be related to DNS/SRV resolution being blocked or restricted by the local network or ISP.

Workaround (Cloud SQL Database)

To ensure a stable and easy-to-run environment with real database operations, I used Supabase PostgreSQL as a cloud SQL database.
The backend architecture remains clean and database-agnostic, allowing an easy switch back to MongoDB Atlas once SRV DNS resolution becomes available.

Setup Instructions
Backend
cd backend
npm install
npm run dev


Create a .env file with:

DATABASE_URL=your_supabase_connection_string
JWT_SECRET=your_secret_key
PORT=5000

Frontend
cd frontend
npm install
npm run dev

Pending Improvements (Optional)

Pagination & search for articles

Notifications for workflow actions

UI/UX animations

Multi-reviewer support

Final Notes

This project focuses on clarity, correctness, and realistic workflow simulation rather than shortcuts.
All mandatory requirements of the task were implemented, including manual track changes using JavaScript and functional React components.