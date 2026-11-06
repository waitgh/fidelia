// Fictional sample data for the demo church and for development.
import type { AppDb } from './db';
import { createCategory } from './categories';
import { createDonor } from './donors';
import { createBatch, closeBatch } from './batches';
import { createOffering } from './offerings';
import { createPledge } from './pledges';
import { updateSetting } from './settings';

export function seedDemo(db: AppDb, year = new Date().getFullYear()) {
  updateSetting(db, 'churchName', 'Grace Community Church (Demo)');
  updateSetting(db, 'congregationOptions', ['English', 'Mandarin', 'Youth']);
  const cats = ['General Fund', 'Missions', 'Building Fund', 'Lunch'].map((name) => createCategory(db, { name }).id);
  const people: [string, string, string, string?][] = [
    ['Grace', 'Chen', 'English', 'grace.chen@example.com'],
    ['David', 'Lee', 'Mandarin', 'david.lee@example.com'],
    ['Maria', 'Garcia', 'English'],
    ['Samuel', 'Park', 'Youth', 'sam.park@example.com'],
    ['Ruth', 'Johnson', 'English', 'ruth.j@example.com'],
    ['Peter', 'Wang', 'Mandarin'],
  ];
  const donors = people.map(([firstName, lastName, congregation, email], i) =>
    createDonor(db, { firstName, lastName, congregation, email, envelopeNumber: String(101 + i) }).id,
  );
  const methods = ['check', 'cash', 'zelle', 'venmo'];
  const thisMonth = new Date().getMonth();
  for (let m = 0; m <= thisMonth; m++) {
    const date = `${year}-${String(m + 1).padStart(2, '0')}-07`;
    const batch = createBatch(db, { date, description: `Sunday offering ${date}` }).id;
    donors.forEach((donorId, i) => {
      if ((i + m) % 4 === 3) return;
      const amount = 50 + ((i * 37 + m * 13) % 10) * 25;
      createOffering(db, { batchId: batch, donorId, categoryId: cats[(i + m) % 3]!, amount, paymentMethod: methods[(i + m) % 4] });
    });
    createOffering(db, { batchId: batch, donorId: donors[0]!, categoryId: cats[3]!, amount: 8, paymentMethod: 'cash' });
    if (m < thisMonth) closeBatch(db, batch);
  }
  createPledge(db, { donorId: donors[1]!, categoryId: cats[2]!, amount: 2400, startDate: `${year}-01-01`, endDate: `${year}-12-31` });
  createPledge(db, { donorId: donors[4]!, categoryId: cats[1]!, amount: 1200, startDate: `${year}-01-01`, endDate: `${year}-12-31` });
}
