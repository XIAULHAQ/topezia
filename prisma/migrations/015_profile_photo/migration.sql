-- Profile photo (spec §3.4). Best-effort extracted from the uploaded CV as a
-- small thumbnail data URI so the profile has a face without the user hunting
-- for one. NOT the résumé file (still never stored); null when no usable photo.
-- User-editable later.
ALTER TABLE "Profile" ADD COLUMN "photoUrl" TEXT;
