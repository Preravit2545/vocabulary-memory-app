const fs = require('fs');

const files = [
  'src/app/app.ts',
  'src/app/components/add-word/add-word.component.ts',
  'src/app/components/dashboard/dashboard.component.ts',
  'src/app/components/progress/progress.component.ts',
  'src/app/components/review/review.component.ts',
  'src/app/components/settings/settings.component.ts',
];

for (const f of files) {
  let c = fs.readFileSync(f, 'utf8');

  if (!c.includes('ViewEncapsulation')) {
    c = c.replace(
      /import \{([^}]+)\} from '@angular\/core'/,
      (m, g) => "import {" + g.trimEnd() + ", ViewEncapsulation } from '@angular/core'"
    );
  }

  if (!c.includes('encapsulation: ViewEncapsulation.None')) {
    c = c.replace(
      /(@Component\(\{)/,
      '$1\n  encapsulation: ViewEncapsulation.None,'
    );
  }

  fs.writeFileSync(f, c);
  console.log('Updated:', f);
}
