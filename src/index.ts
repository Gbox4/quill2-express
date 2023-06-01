require('module-alias/register')

import app from './app';

const port = process.env.PORT || 3003;
app.listen(port, () => {
  /* eslint-disable no-console */
  console.log(`Listening: http://localhost:${port}`);
  /* eslint-enable no-console */
});
