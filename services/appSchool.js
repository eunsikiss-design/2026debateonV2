'use strict';
// This deployment serves one school. Keep one stable storage namespace for
// existing drafts and Sheets settings; users never choose a school code.
function id(env=process.env){return env.ADMIN_SCHOOL_ID||env.STUDENT_SCHOOL_ID||'default-school';}
module.exports={id};
