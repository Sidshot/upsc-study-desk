/**
 * UPSC Study Desk - Data Invariants
 * Ensures data integrity before database operations
 */

const Invariants = {
    /**
     * Validate a provider object
     * @param {Object} provider
     * @param {Array} validPaperIds - List of valid paper IDs
     * @returns {Object} { valid: boolean, error: string|null }
     */
    validateProvider(provider, validPaperIds) {
        if (!provider) {
            return { valid: false, error: 'Provider is required' };
        }

        if (!provider.id || typeof provider.id !== 'string') {
            return { valid: false, error: 'Provider must have a valid ID' };
        }

        if (!provider.name || typeof provider.name !== 'string' || provider.name.trim() === '') {
            return { valid: false, error: 'Provider must have a non-empty name' };
        }

        if (!provider.paperId || !validPaperIds.includes(provider.paperId)) {
            return { valid: false, error: `Provider must have a valid paperId. Got: ${provider.paperId}` };
        }

        return { valid: true, error: null };
    },

    /**
     * Validate a course object
     * @param {Object} course
     * @param {Array} validProviderIds - List of valid provider IDs
     * @returns {Object} { valid: boolean, error: string|null }
     */
    validateCourse(course, validProviderIds) {
        if (!course) {
            return { valid: false, error: 'Course is required' };
        }

        if (!course.id || typeof course.id !== 'string') {
            return { valid: false, error: 'Course must have a valid ID' };
        }

        if (!course.name || typeof course.name !== 'string' || course.name.trim() === '') {
            return { valid: false, error: 'Course must have a non-empty name' };
        }

        if (!course.providerId || !validProviderIds.includes(course.providerId)) {
            return { valid: false, error: `Course must have a valid providerId. Got: ${course.providerId}` };
        }

        return { valid: true, error: null };
    },

    /**
     * Validate a lecture object
     * @param {Object} lecture
     * @param {Array} validCourseIds - List of valid course IDs
     * @returns {Object} { valid: boolean, error: string|null }
     */
    validateLecture(lecture, validCourseIds) {
        if (!lecture) {
            return { valid: false, error: 'Lecture is required' };
        }

        if (!lecture.id || typeof lecture.id !== 'string') {
            return { valid: false, error: 'Lecture must have a valid ID' };
        }

        if (!lecture.title || typeof lecture.title !== 'string' || lecture.title.trim() === '') {
            return { valid: false, error: 'Lecture must have a non-empty title' };
        }

        if (!lecture.courseId || !validCourseIds.includes(lecture.courseId)) {
            return { valid: false, error: `Lecture must have a valid courseId. Got: ${lecture.courseId}` };
        }

        if (!['video', 'pdf'].includes(lecture.type)) {
            return { valid: false, error: `Lecture type must be 'video' or 'pdf'. Got: ${lecture.type}` };
        }

        return { valid: true, error: null };
    },

    /**
     * Validate a note object
     * @param {Object} note
     * @param {Array} validLectureIds - List of valid lecture IDs
     * @returns {Object} { valid: boolean, error: string|null }
     */
    validateNote(note, validLectureIds) {
        if (!note) {
            return { valid: false, error: 'Note is required' };
        }

        if (!note.id || typeof note.id !== 'string') {
            return { valid: false, error: 'Note must have a valid ID' };
        }

        if (!note.lectureId || !validLectureIds.includes(note.lectureId)) {
            return { valid: false, error: `Note must have a valid lectureId. Got: ${note.lectureId}` };
        }

        return { valid: true, error: null };
    },

    /**
     * Check and throw if invalid
     * @param {string} type - 'provider', 'course', 'lecture', 'note'
     * @param {Object} data - Data to validate
     * @param {Array} validParentIds - Valid parent IDs for referential integrity
     * @throws {Error} If validation fails
     */
    async check(type, data, validParentIds) {
        let result;

        switch (type) {
            case 'provider':
                result = this.validateProvider(data, validParentIds);
                break;
            case 'course':
                result = this.validateCourse(data, validParentIds);
                break;
            case 'lecture':
                result = this.validateLecture(data, validParentIds);
                break;
            case 'note':
                result = this.validateNote(data, validParentIds);
                break;
            default:
                throw new Error(`Unknown invariant type: ${type}`);
        }

        if (!result.valid) {
            console.error(`Invariant violation (${type}):`, result.error, data);
            throw new Error(`Invariant violation: ${result.error}`);
        }

        return true;
    }
};

// Make Invariants globally available
window.Invariants = Invariants;
