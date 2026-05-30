// ADD THESE LINES to your existing server.js:
//
// 1. After the existing route imports, add:
//    const reportsRouter = require('./routes/reports');
//
// 2. After the existing app.use('/api/marking', ...) line, add:
//    app.use('/api/reports', reportsRouter);
//
// 3. Run these DB migrations (one time):

/*
psql -U teauser -d teadb -h localhost -c "
  ALTER TABLE catalogue ADD COLUMN IF NOT EXISTS invoice_no_raw TEXT;
  ALTER TABLE markings  ADD COLUMN IF NOT EXISTS invoice TEXT;
  ALTER TABLE markings  ADD COLUMN IF NOT EXISTS origin  TEXT;
"
*/

// The full server.js should look like this at the route registration section:
//
// const importRouter   = require('./routes/import');
// const catalogueRouter= require('./routes/catalogue');
// const mappingRouter  = require('./routes/mapping');
// const markingRouter  = require('./routes/marking');
// const partiesRouter  = require('./routes/parties');
// const labelsRouter   = require('./routes/labels');
// const reportsRouter  = require('./routes/reports');   // NEW
//
// app.use('/api/import',    importRouter);
// app.use('/api/catalogue', catalogueRouter);
// app.use('/api/mapping',   mappingRouter);
// app.use('/api/marking',   markingRouter);
// app.use('/api/parties',   partiesRouter);
// app.use('/api/labels',    labelsRouter);
// app.use('/api/reports',   reportsRouter);   // NEW

module.exports = {};
