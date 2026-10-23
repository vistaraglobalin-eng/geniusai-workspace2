\set ON_ERROR_STOP 1
create or replace function pg_temp.check(cond boolean, label text) returns void language plpgsql as $$
begin if cond then raise notice 'PASS %', label; else raise exception 'FAIL %', label; end if; end $$;
select pg_temp.check((select 'application/vnd.openxmlformats-officedocument.presentationml.presentation' = any(allowed_mime_types) and 'application/zip' = any(allowed_mime_types) and 'application/rtf' = any(allowed_mime_types) from storage.buckets where id='private-user-files'), 'bucket accepts PowerPoint, RTF and ZIP');
select pg_temp.check((select public = false and file_size_limit = 26214400 and array_length(allowed_mime_types,1) = 18 from storage.buckets where id='private-user-files'), 'bucket still private, 25 MB, 18 types');
select pg_temp.check((select not ('application/x-msdownload' = any(allowed_mime_types)) and not ('text/html' = any(allowed_mime_types)) from storage.buckets where id='private-user-files'), 'executables and HTML still refused');
