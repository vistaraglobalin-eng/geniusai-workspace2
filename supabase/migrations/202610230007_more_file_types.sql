-- GeniusAI Workspace: more file types in private storage
-- Apply after 202610230006_preferences_and_profile_hardening.sql.
-- Adds PowerPoint, OpenDocument and RTF uploads (for Office to PDF) and ZIP
-- (PDF to JPG returns several pages as one ZIP). Size limit unchanged (25 MB).

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
  'application/rtf',
  'application/zip',
  'text/csv',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic'
]
where id = 'private-user-files';
