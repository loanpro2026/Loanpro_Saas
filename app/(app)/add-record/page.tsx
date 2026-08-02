/**
 * Add New Record — /add-record
 *
 * The desktop's Addrecord screen lives at this path, so the URL matches what a
 * migrating shop already knows. Re-exported rather than moved: the form still
 * needs to be checked field-for-field against Addrecord.tsx, and doing that in
 * one place is easier than after a move.
 */
export { default } from '../loans/new/page'
