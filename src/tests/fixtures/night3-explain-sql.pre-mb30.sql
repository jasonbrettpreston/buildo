\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = 0;
SET LOCAL lock_timeout = '120s';
CREATE TEMP TABLE "r_coa_applications" (LIKE public."coa_applications") ON COMMIT DROP;
\copy "r_coa_applications" FROM PROGRAM '/usr/bin/gzip -dc <DIR>/coa_applications.bin.gz' WITH (FORMAT binary)
CREATE TEMP TABLE "r_parcel_abutments" (LIKE public."parcel_abutments") ON COMMIT DROP;
\copy "r_parcel_abutments" FROM PROGRAM '/usr/bin/gzip -dc <DIR>/parcel_abutments.bin.gz' WITH (FORMAT binary)
CREATE TEMP TABLE "r_parcels" (LIKE public."parcels") ON COMMIT DROP;
\copy "r_parcels" FROM PROGRAM '/usr/bin/gzip -dc <DIR>/parcels.bin.gz' WITH (FORMAT binary)
CREATE TEMP TABLE "r_setnull-permits-neighbourhood_id" ON COMMIT DROP AS SELECT "permit_num", "revision_num", "neighbourhood_id" FROM public."permits" LIMIT 0;
\copy "r_setnull-permits-neighbourhood_id" FROM PROGRAM '/usr/bin/gzip -dc <DIR>/setnull-permits-neighbourhood_id.bin.gz' WITH (FORMAT binary)
SET LOCAL transaction_read_only = on;
EXPLAIN DELETE FROM public."parcel_abutments" x WHERE NOT EXISTS (SELECT 1 FROM "r_parcel_abutments" b WHERE b."parcel_id" = x."parcel_id" AND b."neighbour_id" = x."neighbour_id");
EXPLAIN DELETE FROM public."coa_applications" x WHERE NOT EXISTS (SELECT 1 FROM "r_coa_applications" b WHERE b."id" = x."id");
EXPLAIN DELETE FROM public."parcels" x WHERE NOT EXISTS (SELECT 1 FROM "r_parcels" b WHERE b."id" = x."id");
EXPLAIN UPDATE public."parcels" x SET ("id", "geom") = ROW(b."id", b."geom") FROM "r_parcels" b WHERE b."id" = x."id" AND x::text IS DISTINCT FROM b::text;
EXPLAIN UPDATE public."parcels" x SET ("id", "geom") = ROW(b."id", b."geom") FROM "r_parcels" b WHERE b."id" = x."id" AND x::text IS DISTINCT FROM b::text;
EXPLAIN INSERT INTO public."parcels" ("id", "geom") SELECT b."id", b."geom" FROM "r_parcels" b WHERE NOT EXISTS (SELECT 1 FROM public."parcels" x WHERE x."id" = b."id");
EXPLAIN UPDATE public."coa_applications" x SET ("id", "application_number", "lead_id") = ROW(b."id", b."application_number", b."lead_id") FROM "r_coa_applications" b WHERE b."id" = x."id" AND x::text IS DISTINCT FROM b::text;
EXPLAIN UPDATE public."coa_applications" x SET ("id", "application_number", "lead_id") = ROW(b."id", b."application_number", b."lead_id") FROM "r_coa_applications" b WHERE b."id" = x."id" AND x::text IS DISTINCT FROM b::text;
EXPLAIN INSERT INTO public."coa_applications" ("id", "application_number", "lead_id") SELECT b."id", b."application_number", b."lead_id" FROM "r_coa_applications" b WHERE NOT EXISTS (SELECT 1 FROM public."coa_applications" x WHERE x."id" = b."id");
EXPLAIN UPDATE public."parcel_abutments" x SET ("parcel_id", "neighbour_id") = ROW(b."parcel_id", b."neighbour_id") FROM "r_parcel_abutments" b WHERE b."parcel_id" = x."parcel_id" AND b."neighbour_id" = x."neighbour_id" AND x::text IS DISTINCT FROM b::text;
EXPLAIN UPDATE public."parcel_abutments" x SET ("parcel_id", "neighbour_id") = ROW(b."parcel_id", b."neighbour_id") FROM "r_parcel_abutments" b WHERE b."parcel_id" = x."parcel_id" AND b."neighbour_id" = x."neighbour_id" AND x::text IS DISTINCT FROM b::text;
EXPLAIN INSERT INTO public."parcel_abutments" ("parcel_id", "neighbour_id") SELECT b."parcel_id", b."neighbour_id" FROM "r_parcel_abutments" b WHERE NOT EXISTS (SELECT 1 FROM public."parcel_abutments" x WHERE x."parcel_id" = b."parcel_id" AND x."neighbour_id" = b."neighbour_id");
EXPLAIN UPDATE public."permits" c SET ("neighbourhood_id") = ROW(b."neighbourhood_id") FROM "r_setnull-permits-neighbourhood_id" b WHERE b."permit_num" = c."permit_num" AND b."revision_num" = c."revision_num" AND (c."neighbourhood_id") IS DISTINCT FROM (b."neighbourhood_id");
SELECT 'coa_applications' AS restored_table, 1/(CASE WHEN NOT EXISTS (SELECT 1 FROM public."coa_applications" x FULL JOIN "r_coa_applications" b ON x."id" = b."id" WHERE x::text IS DISTINCT FROM b::text) THEN 1 ELSE 0 END) AS equal;
SELECT 'parcel_abutments' AS restored_table, 1/(CASE WHEN NOT EXISTS (SELECT 1 FROM public."parcel_abutments" x FULL JOIN "r_parcel_abutments" b ON x."parcel_id" = b."parcel_id" AND x."neighbour_id" = b."neighbour_id" WHERE x::text IS DISTINCT FROM b::text) THEN 1 ELSE 0 END) AS equal;
SELECT 'parcels' AS restored_table, 1/(CASE WHEN NOT EXISTS (SELECT 1 FROM public."parcels" x FULL JOIN "r_parcels" b ON x."id" = b."id" WHERE x::text IS DISTINCT FROM b::text) THEN 1 ELSE 0 END) AS equal;
SELECT 'permits.neighbourhood_id' AS reference, 1/(CASE WHEN NOT EXISTS (SELECT 1 FROM "r_setnull-permits-neighbourhood_id" b LEFT JOIN public."permits" c ON c."permit_num" = b."permit_num" AND c."revision_num" = b."revision_num" WHERE (c."neighbourhood_id") IS DISTINCT FROM (b."neighbourhood_id"))
    AND (SELECT count(*) FROM public."permits" WHERE "neighbourhood_id" IS NOT NULL) = (SELECT count(*) FROM "r_setnull-permits-neighbourhood_id") THEN 1 ELSE 0 END) AS equal;
ROLLBACK;
