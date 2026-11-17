/**
 * The SQL for a student's own profile. Only ever keyed by the signed-in
 * student's id: there is deliberately no way to look up someone else's
 * profile here. The one place another student sees it is a leader's view of
 * a pending join request, read in findGroup (server/src/groups/repository.ts).
 */
import { poolDatabase, type Database } from '../db/pool.js';
import {
  isEmptyProfile,
  type MeetingPreference,
  type StudentProfile,
  type StudentYear,
  type StudyStyle,
} from './validation.js';

export interface ProfileRepository {
  /** The student's profile, or null when they have not added one. */
  findProfile(userId: string): Promise<StudentProfile | null>;
  /** Saves the whole profile; an empty one deletes it. Returns what is now stored. */
  saveProfile(userId: string, profile: StudentProfile): Promise<StudentProfile | null>;
}

/** The student_profiles columns as selected, under these names. */
export interface ProfileColumns {
  major: string | null;
  year: StudentYear | null;
  meeting_preference: MeetingPreference | null;
  study_styles: StudyStyle[];
}

export function toStudentProfile(row: ProfileColumns): StudentProfile {
  return {
    major: row.major,
    year: row.year,
    meetingPreference: row.meeting_preference,
    studyStyles: row.study_styles,
  };
}

export function createPostgresProfileRepository(db: Database): ProfileRepository {
  const { query } = db;
  return {
    async findProfile(userId) {
      const rows = await query<ProfileColumns>(
        'SELECT major, year, meeting_preference, study_styles FROM student_profiles WHERE user_id = $1',
        [userId],
      );
      const row = rows[0];
      return row === undefined ? null : toStudentProfile(row);
    },

    async saveProfile(userId, profile) {
      // "No row" is the only meaning of "has not added a profile", so a
      // student who clears every field is back to having none.
      if (isEmptyProfile(profile)) {
        await query('DELETE FROM student_profiles WHERE user_id = $1', [userId]);
        return null;
      }
      const rows = await query<ProfileColumns>(
        `INSERT INTO student_profiles (user_id, major, year, meeting_preference, study_styles)
         VALUES ($1, $2, $3, $4, $5::text[])
         ON CONFLICT (user_id) DO UPDATE
           SET major = EXCLUDED.major,
               year = EXCLUDED.year,
               meeting_preference = EXCLUDED.meeting_preference,
               study_styles = EXCLUDED.study_styles,
               updated_at = now()
         RETURNING major, year, meeting_preference, study_styles`,
        [userId, profile.major, profile.year, profile.meetingPreference, profile.studyStyles],
      );
      const row = rows[0];
      return row === undefined ? null : toStudentProfile(row);
    },
  };
}

export const postgresProfileRepository = createPostgresProfileRepository(poolDatabase);
