// backend/utils/emailTemplates.js
// -------------------------------------------------------------
//  testEmail() — used by /api/test-email
// -------------------------------------------------------------

function testEmail() {
  return {
    subject: 'SMTP test – it works! 🎉',
    html: '<p>If you can read this, your e-mail configuration is good.</p>',
  };
}

module.exports = { testEmail };
