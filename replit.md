# FiltrePlante Invoice Submission Application

## Overview

FiltrePlante Invoice Submission is a mobile-first web application designed for field professionals to submit expense invoices. The application provides token-based access for three team members (Michael, Marine, Fatou), allowing them to submit invoices with file attachments that are automatically uploaded to Google Drive. The system includes invoice tracking, supplier management, project association, and admin capabilities for data export.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- React 18 with TypeScript
- Vite as build tool and development server
- Wouter for client-side routing
- TanStack Query (React Query) for server state management
- Shadcn/ui component library with Radix UI primitives
- Tailwind CSS for styling with custom FiltrePlante brand colors

**Design Philosophy:**
- Mobile-first responsive design optimized for touch interfaces
- Material Design principles with FiltrePlante brand identity
- Teal-based color palette (#157a70 primary, #2997aa secondary)
- Clean, utility-focused interface for field professionals

**Key Components:**
- `InvoiceForm`: Main submission form with validation via react-hook-form and zod
- `SupplierSearch`: Fuzzy search component using Fuse.js for intelligent supplier matching
- `ProjectSelect`: Grouped project selection (2025 projects vs. older projects)
- `TrackingTable`: Invoice history display with download/delete capabilities
- `AdminDashboard`: Administrative interface for data export and database management

### Backend Architecture

**Technology Stack:**
- Node.js with Express.js
- TypeScript throughout
- Drizzle ORM for database operations
- Multer for multipart form handling (file uploads)

**API Design:**
- RESTful endpoints under `/api` prefix
- Token-based access control (no traditional authentication)
- File uploads handled in-memory before Google Drive transfer

**Key Routes:**
- `GET /api/validate-token/:token` - Validates user access tokens
- `GET /api/suppliers` - Retrieves all suppliers
- `POST /api/suppliers` - Creates new suppliers with duplicate detection
- `GET /api/projects` - Fetches all projects
- `POST /api/invoices` - Creates invoice with file upload
- `GET /api/invoices/:id/download` - Downloads invoice file from Google Drive
- `DELETE /api/invoices/:id` - Deletes invoice and associated Drive file
- `POST /api/admin/login` - Admin password authentication
- `GET /api/admin/export-csv` - Exports all invoices to CSV

### Data Storage

**Database Schema (PostgreSQL via Neon):**

1. **user_tokens** - Access control tokens for three team members
   - Stores name, unique token, email, and Google Drive folder ID
   - No traditional user/password authentication

2. **suppliers** - Vendor/supplier master data
   - Initially seeded from CSV, then managed via application
   - Tracks total invoice amounts per supplier

3. **projects** - Project/operation master data
   - Initially seeded from CSV
   - Contains project number, name, and start date

4. **invoices** - Core invoice records
   - Links to suppliers and projects via foreign keys
   - Stores all invoice metadata and Google Drive file references
   - Tracks payment type (Wave, Cash, or Cash reimbursed by Wave Business)
   - Conditional VAT fields (hidden for restaurant category)

5. **admin_config** - Admin panel configuration
   - Stores hashed admin password

**Data Initialization:**
- Seeding script populates suppliers and projects from CSV files on first run
- User tokens generated with cryptographically secure random strings
- Admin password hashed using bcrypt

### Authentication & Authorization

**Token-Based Access Control:**
- Three unique URLs with embedded tokens (one per team member)
- No login flow - direct access via personalized URLs
- Token validation on each request
- Admin panel uses separate password authentication

**Security Approach:**
- Tokens are cryptographically random 32-byte hex strings
- Admin password hashed with bcrypt
- No session management required due to token-in-URL pattern

### External Dependencies

**Google Drive Integration:**
- Files uploaded to Google Drive via official googleapis client
- Uses Replit Connectors system for OAuth credentials
- Each team member has dedicated folder via `driveFolderId`
- Automatic access token refresh handling
- File download proxied through backend API

**Resend Email Service:**
- Sends invoice confirmation emails after successful submission
- Uses Replit Connectors for API key management
- Email includes invoice details and confirmation message

**Replit-Specific Infrastructure:**
- Database provisioned via Replit PostgreSQL/Neon integration
- Environment variables for `DATABASE_URL`
- Connectors system for Google Drive and Resend credentials
- Runtime error overlay and cartographer plugins in development

**Third-Party Libraries:**
- **Fuse.js** - Fuzzy search for supplier matching with duplicate detection
- **Papa Parse** - CSV parsing for initial data seeding
- **date-fns** - Date formatting and manipulation with French locale support
- **bcrypt** - Password hashing for admin authentication
- **Zod** - Runtime schema validation for form inputs and API payloads

**UI Component Dependencies:**
- Radix UI primitives for accessible, unstyled components
- class-variance-authority (cva) for component variant management
- Lucide React for iconography
- Tailwind CSS with custom configuration for FiltrePlante branding