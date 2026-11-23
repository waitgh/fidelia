// Fictional sample data for the demo church and for development.
import type { AppDb } from './db';
import { createCategory, listCategories } from './categories';
import { createDonor } from './donors';
import { createBatch, closeBatch, updateBatch } from './batches';
import { createOffering } from './offerings';
import { createPledge } from './pledges';
import { updateSetting } from './settings';

export function seedDemo(db: AppDb, year = new Date().getFullYear()) {
  updateSetting(db, 'churchName', 'Grace Community Church (Demo)');
  updateSetting(db, 'congregationOptions', ['English', 'Mandarin', 'Youth']);
  // Reuse the categories every new church starts with (General, Building, Mercy, Mission); add Lunch.
  const existing = new Map(listCategories(db).map((c) => [c.name, c.id]));
  const cats = ['General', 'Mission', 'Building', 'Lunch'].map((name) => existing.get(name) ?? createCategory(db, { name }).id);
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
      const categoryId = cats[(i + m) % 3]!;
      // Some Mission gifts are for a named missionary.
      const designation = categoryId === cats[1] && i % 2 === 0 ? (i % 4 === 0 ? 'Smith family (Kenya)' : 'Rev. Lin') : null;
      createOffering(db, { batchId: batch, donorId, categoryId, amount, paymentMethod: methods[(i * 2 + m) % 4], designation });
    });
    updateBatch(db, batch, { attendanceAdults: 70 + ((m * 7) % 15), attendanceChildren: 18 + ((m * 3) % 8) });
    createOffering(db, { batchId: batch, donorId: donors[0]!, categoryId: cats[3]!, amount: 8, paymentMethod: 'cash' });
    if (m < thisMonth) closeBatch(db, batch);
  }
  createPledge(db, { donorId: donors[1]!, categoryId: cats[2]!, amount: 2400, startDate: `${year}-01-01`, endDate: `${year}-12-31` });
  createPledge(db, { donorId: donors[4]!, categoryId: cats[1]!, amount: 1200, startDate: `${year}-01-01`, endDate: `${year}-12-31` });
}
