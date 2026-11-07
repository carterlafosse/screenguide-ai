// users.js: the seeded test organizations and their users. Seeds and tests both import this file,
// so they always agree on emails, roles and the shared seed password.

// Meets the password rules (10–72 characters, a letter and a number). Test/dev data only.
export const SEED_PASSWORD = 'ScreenGuide123';

export const SEED_ORGS = [
  {
    key: 'acme',
    name: 'Acme Corp',
    slug: 'acme',
    itContactEmail: 'it@acme.test',
    users: [
      {
        key: 'admin',
        name: 'Ava Chen',
        email: 'admin@acme.test',
        role: 'admin',
        department: 'Operations',
      },
      {
        key: 'tech1',
        name: 'Tom Brooks',
        email: 'tech1@acme.test',
        role: 'technician',
        department: 'IT',
      },
      {
        key: 'tech2',
        name: 'Priya Shah',
        email: 'tech2@acme.test',
        role: 'technician',
        department: 'IT',
      },
      {
        key: 'user1',
        name: 'Dana Lee',
        email: 'user1@acme.test',
        role: 'end_user',
        department: 'Front Office',
      },
      {
        key: 'user2',
        name: 'Eli Martin',
        email: 'user2@acme.test',
        role: 'end_user',
        department: 'Accounting',
      },
      {
        key: 'user3',
        name: 'Fatima Noor',
        email: 'user3@acme.test',
        role: 'end_user',
        department: 'Sales',
      },
    ],
  },
  {
    key: 'globex',
    name: 'Globex',
    slug: 'globex',
    itContactEmail: 'it@globex.test',
    users: [
      {
        key: 'admin',
        name: 'Raj Patel',
        email: 'admin@globex.test',
        role: 'admin',
        department: 'Management',
      },
      {
        key: 'tech1',
        name: 'Jordan Blake',
        email: 'tech1@globex.test',
        role: 'technician',
        department: 'IT',
      },
      {
        key: 'tech2',
        name: 'Mei Wong',
        email: 'tech2@globex.test',
        role: 'technician',
        department: 'IT',
      },
      {
        key: 'user1',
        name: 'Sam Rivera',
        email: 'user1@globex.test',
        role: 'end_user',
        department: 'Reception',
      },
      {
        key: 'user2',
        name: 'Noah Kim',
        email: 'user2@globex.test',
        role: 'end_user',
        department: 'Finance',
      },
      {
        key: 'user3',
        name: 'Grace Okafor',
        email: 'user3@globex.test',
        role: 'end_user',
        department: 'Marketing',
      },
    ],
  },
];

/**
 * Email of a seeded user, e.g. seedEmail('acme', 'admin') → 'admin@acme.test'.
 * @param {string} orgKey
 * @param {string} userKey
 */
export function seedEmail(orgKey, userKey) {
  const org = SEED_ORGS.find((o) => o.key === orgKey);
  const user = org?.users.find((u) => u.key === userKey);
  if (!user) throw new Error(`Unknown seed user ${orgKey}.${userKey}`);
  return user.email;
}
