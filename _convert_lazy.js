const fs = require('fs');
const path = 'web-ui/src/panels/registry.js';
let c = fs.readFileSync(path, 'utf8');

// Replace header comment to mention lazy loading (already done)
// Add lazy import after the header block
c = c.replace(
  "import DepthChart from '../components/DepthChart'",
  "import { lazy } from 'react'\n\nconst DepthChart = lazy(() => import('../components/DepthChart'))"
);

// Replace all remaining static imports with lazy
c = c.replace(/^import (\w+) from '\.\.\/components\/\1'/gm, "const $1 = lazy(() => import('../components/$1'))");

fs.writeFileSync(path, c, 'utf8');
console.log('Done. Converted all imports to React.lazy.');
