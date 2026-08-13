-- Run once in Supabase SQL Editor (primary project) to stop FK errors on attendance sync.
ALTER TABLE public.student_attendance DROP CONSTRAINT IF EXISTS student_attendance_student_id_fkey;
ALTER TABLE public.teacher_attendance DROP CONSTRAINT IF EXISTS teacher_attendance_teacher_id_fkey;
ALTER TABLE public.exam_results DROP CONSTRAINT IF EXISTS exam_results_student_id_fkey;
