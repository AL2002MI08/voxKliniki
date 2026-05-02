/**
 * Seed script — creates demo clinic, departments, and staff users.
 * Run: node db/seed.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Clinic ──────────────────────────────────────────────────────────────
    const { rows: [clinic] } = await client.query(
      `INSERT INTO clinics (name, code, location, phone_number)
       VALUES ('Kigali Central Clinic', 'KC', 'Kigali, Rwanda', '+250788000001')
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
       RETURNING *`
    );
    console.log(`Clinic: ${clinic.name} (${clinic.id})`);

    // ── Departments ─────────────────────────────────────────────────────────
    const depts = [
      { name: 'Emergency', code: 'EMRG', is_emergency: true,  avg_wait_time: 0  },
      { name: 'Internal Medicine',  code: 'INTM', is_emergency: false, avg_wait_time: 45 },
      { name: 'Pediatrics',         code: 'PED',  is_emergency: false, avg_wait_time: 30 },
      { name: 'Cardiology',         code: 'CARD', is_emergency: false, avg_wait_time: 60 },
      { name: 'OB/GYN',             code: 'OBGN', is_emergency: false, avg_wait_time: 40 },
      { name: 'Orthopedics',        code: 'ORTH', is_emergency: false, avg_wait_time: 50 },
      { name: 'ENT',                code: 'ENT',  is_emergency: false, avg_wait_time: 35 },
      { name: 'Dermatology',        code: 'DERM', is_emergency: false, avg_wait_time: 55 },
    ];

    const deptIds = {};
    for (const d of depts) {
      const { rows: [row] } = await client.query(
        `INSERT INTO departments (clinic_id, name, code, is_emergency, avg_wait_time, staff_available)
         VALUES ($1, $2, $3, $4, $5, 2)
         ON CONFLICT (clinic_id, code) DO UPDATE SET name = EXCLUDED.name
         RETURNING *`,
        [clinic.id, d.name, d.code, d.is_emergency, d.avg_wait_time]
      );
      deptIds[d.code] = row.id;
      console.log(`  Dept: ${row.name}`);
    }

    // ── Users ───────────────────────────────────────────────────────────────
    const users = [
      { name: 'Admin User',  email: 'admin@kigali.clinic', password: 'password123', role: 'admin',  dept: null    },
      { name: 'Staff User',  email: 'staff@kigali.clinic', password: 'password123', role: 'staff',  dept: 'INTM'  },
      { name: 'Dr. Uwimana', email: 'doctor@kigali.clinic',password: 'password123', role: 'doctor', dept: 'CARD'  },
    ];

    for (const u of users) {
      const hash = await bcrypt.hash(u.password, 10);
      const { rows: [row] } = await client.query(
        `INSERT INTO users (clinic_id, name, email, password_hash, role, department_id)
         VALUES ($1, $2, lower($3), $4, $5, $6)
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash
         RETURNING *`,
        [clinic.id, u.name, u.email, hash, u.role, u.dept ? deptIds[u.dept] : null]
      );
      console.log(`  User: ${row.email} (${row.role})`);
    }

    // ── Demo queue entries ───────────────────────────────────────────────────
    console.log('\nInserting demo queue entries...');

    const demoPatients = [
      { phone: '+250788100001', name: 'Jean Baptiste Nkusi',    conditions: ['hypertension']    },
      { phone: '+250788100002', name: 'Uwase Marie Claire',     conditions: ['diabetes']         },
      { phone: '+250788100003', name: 'Gasana Patrick',         conditions: []                   },
      { phone: '+250788100004', name: 'Mukamana Vestine',       conditions: ['asthma']           },
      { phone: '+250788100005', name: 'Habimana Celestin',      conditions: []                   },
      { phone: '+250788100006', name: 'Nyiraneza Claudine',     conditions: ['hypertension', 'diabetes'] },
    ];

    const demoEntries = [
      { patientIdx: 0, dept: 'EMRG', urgency: 'critical', complaint: 'Severe chest pain and shortness of breath', red_flag: true  },
      { patientIdx: 1, dept: 'CARD', urgency: 'high',     complaint: 'Irregular heartbeat, dizziness',            red_flag: false },
      { patientIdx: 2, dept: 'INTM', urgency: 'medium',   complaint: 'Persistent fever for 3 days, body aches',   red_flag: false },
      { patientIdx: 3, dept: 'PED',  urgency: 'medium',   complaint: 'Child with high fever and rash',            red_flag: false },
      { patientIdx: 4, dept: 'ENT',  urgency: 'low',      complaint: 'Ear pain and reduced hearing',              red_flag: false },
      { patientIdx: 5, dept: 'INTM', urgency: 'high',     complaint: 'Blood sugar very high, headache, fatigue',  red_flag: false },
    ];

    for (let i = 0; i < demoPatients.length; i++) {
      const dp = demoPatients[i];
      const { rows: [patient] } = await client.query(
        `INSERT INTO patients (phone_number, name, chronic_conditions, consent_given, visit_count)
         VALUES ($1, $2, $3, true, $4)
         ON CONFLICT (phone_number) DO UPDATE SET name = EXCLUDED.name
         RETURNING *`,
        [dp.phone, dp.name, dp.conditions, Math.floor(Math.random() * 5) + 1]
      );

      const de = demoEntries[i];
      const { rows: [call] } = await client.query(
        `INSERT INTO calls (patient_id, clinic_id, language_code, chief_complaint, urgency_tier,
                            recommended_department, red_flag_detected, consent_given, call_status,
                            symptoms, agent_summary)
         VALUES ($1,$2,'rw',$3,$4,$5,$6,true,'completed',$7,$8)
         RETURNING *`,
        [
          patient.id, clinic.id, de.complaint, de.urgency,
          depts.find(d => d.code === de.dept)?.name,
          de.red_flag,
          de.complaint.split(' ').slice(0, 3),
          `Patient presents with ${de.complaint}.`,
        ]
      );

      const queueNum = `KC-${de.dept}-${de.urgency.slice(0, 4).toUpperCase()}-${String(i + 1).padStart(3, '0')}`;
      const waitByTier = { critical: 0, high: 30, medium: 90, low: 180 };

      await client.query(
        `INSERT INTO queue_entries
           (call_id, clinic_id, department_id, patient_id, queue_number, urgency_tier,
            position_in_queue, status, estimated_wait_time)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'waiting',$8)
         ON CONFLICT (queue_number) DO NOTHING`,
        [
          call.id, clinic.id, deptIds[de.dept], patient.id,
          queueNum, de.urgency, i + 1, waitByTier[de.urgency],
        ]
      );
      console.log(`  Queue: ${queueNum} — ${patient.name} (${de.urgency})`);
    }

    // ── Hospitals ────────────────────────────────────────────────────────────
    console.log('\nInserting Rwanda hospitals...');
    const hospitals = [
      { name: 'CHUK (CHU Kigali)',             district: 'Nyarugenge', province: 'Kigali',   lat: -1.9441, lng: 30.0619, phone: '+250788060606', emergency: true,  specialties: ['emergency','surgery','cardiology','internal medicine','pediatrics','neurology'] },
      { name: 'King Faisal Hospital',           district: 'Gasabo',     province: 'Kigali',   lat: -1.9349, lng: 30.0934, phone: '+250252582421', emergency: true,  specialties: ['cardiology','oncology','neurology','internal medicine','orthopedics'] },
      { name: 'Rwanda Military Hospital',       district: 'Kicukiro',   province: 'Kigali',   lat: -1.9673, lng: 30.1148, phone: '+250252587890', emergency: true,  specialties: ['emergency','surgery','internal medicine','orthopedics','ENT'] },
      { name: 'Kibagabaga Hospital',            district: 'Gasabo',     province: 'Kigali',   lat: -1.9166, lng: 30.1039, phone: '+250252580500', emergency: true,  specialties: ['emergency','obstetrics','pediatrics','internal medicine'] },
      { name: 'Muhima Hospital',                district: 'Nyarugenge', province: 'Kigali',   lat: -1.9542, lng: 30.0545, phone: '+250252575784', emergency: false, specialties: ['pediatrics','obstetrics','internal medicine'] },
      { name: 'Masaka Hospital',                district: 'Kicukiro',   province: 'Kigali',   lat: -1.9960, lng: 30.0884, phone: '+250252580070', emergency: false, specialties: ['internal medicine','surgery','obstetrics','dermatology'] },
      { name: 'CHUB (CHU Butare)',              district: 'Huye',       province: 'Southern', lat: -2.5988, lng: 29.7389, phone: '+250252530307', emergency: true,  specialties: ['emergency','surgery','internal medicine','pediatrics','obstetrics','neurology'] },
      { name: 'Ruhengeri Referral Hospital',    district: 'Musanze',    province: 'Northern', lat: -1.4986, lng: 29.6347, phone: '+250252546488', emergency: true,  specialties: ['emergency','surgery','internal medicine','pediatrics','obstetrics'] },
      { name: 'Kibungo Referral Hospital',      district: 'Ngoma',      province: 'Eastern',  lat: -2.1594, lng: 30.5344, phone: '+250252563204', emergency: true,  specialties: ['emergency','surgery','internal medicine','obstetrics'] },
      { name: 'Kabgayi Hospital',               district: 'Muhanga',    province: 'Southern', lat: -2.0158, lng: 29.7576, phone: '+250252562443', emergency: false, specialties: ['internal medicine','obstetrics','pediatrics','surgery'] },
      { name: 'Byumba Hospital',                district: 'Gicumbi',    province: 'Northern', lat: -1.5763, lng: 30.0671, phone: '+250252564036', emergency: false, specialties: ['internal medicine','surgery','obstetrics','pediatrics'] },
      { name: 'Nyamata Hospital',               district: 'Bugesera',   province: 'Eastern',  lat: -2.1395, lng: 30.0516, phone: '+250252580830', emergency: false, specialties: ['internal medicine','obstetrics','pediatrics'] },
      { name: 'Gisenyi Hospital',               district: 'Rubavu',     province: 'Western',  lat: -1.6978, lng: 29.2572, phone: '+250252540427', emergency: true,  specialties: ['emergency','surgery','internal medicine','obstetrics'] },
      { name: 'Kibuye Hope Hospital',           district: 'Karongi',    province: 'Western',  lat: -2.0630, lng: 29.3500, phone: '+250252568237', emergency: false, specialties: ['internal medicine','surgery','obstetrics','pediatrics'] },
      { name: 'Nyagatare Hospital',             district: 'Nyagatare',  province: 'Eastern',  lat: -1.2994, lng: 30.3278, phone: '+250252566012', emergency: true,  specialties: ['emergency','surgery','internal medicine','obstetrics'] },
    ];

    for (const h of hospitals) {
      await client.query(
        `INSERT INTO hospitals (name, district, province, phone_number, latitude, longitude, specialties, is_emergency)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT DO NOTHING`,
        [h.name, h.district, h.province, h.phone, h.lat, h.lng, h.specialties, h.emergency]
      );
      console.log(`  Hospital: ${h.name} (${h.district})`);
    }

    await client.query('COMMIT');
    console.log('\nSeed complete.');
    console.log('\nDemo credentials:');
    console.log('  admin@kigali.clinic  / password123');
    console.log('  staff@kigali.clinic  / password123');
    console.log('  doctor@kigali.clinic / password123');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
