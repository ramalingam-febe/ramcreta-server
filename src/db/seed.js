import bcrypt from "bcryptjs";
import { pool, query } from "./pool.js";

// 38 Tamil Nadu districts with short codes
const districts = [
  ["AMP", "Ariyalur"], ["CHE", "Chengalpattu"], ["CHN", "Chennai"], ["COI", "Coimbatore"],
  ["CUD", "Cuddalore"], ["DHA", "Dharmapuri"], ["DIN", "Dindigul"], ["ERO", "Erode"],
  ["KAL", "Kallakurichi"], ["KAN", "Kanchipuram"], ["KAR", "Karur"], ["KKD", "Kanyakumari"],
  ["KRI", "Krishnagiri"], ["MAD", "Madurai"], ["MAY", "Mayiladuthurai"], ["NAG", "Nagapattinam"],
  ["NAM", "Namakkal"], ["NGL", "Nilgiris"], ["PER", "Perambalur"], ["PUD", "Pudukkottai"],
  ["RAM", "Ramanathapuram"], ["RNP", "Ranipet"], ["SAL", "Salem"], ["SIV", "Sivaganga"],
  ["TEN", "Tenkasi"], ["THA", "Thanjavur"], ["THE", "Theni"], ["THV", "Thiruvallur"],
  ["THN", "Thiruvarur"], ["TIR", "Tiruchirappalli"], ["TPP", "Tirupathur"], ["TPR", "Tiruppur"],
  ["TVM", "Tiruvannamalai"], ["TUT", "Thoothukudi"], ["VEL", "Vellore"], ["VIL", "Viluppuram"],
  ["VIR", "Virudhunagar"], ["TIN", "Tindivanam"],
];

const formTemplates = [
  {
    code: "F07", name: "Form 7 - General Complaint",
    schema: {
      sections: [
        { title: "Customer Details", fields: [
          { key: "name", label: "Name", type: "text", required: true },
          { key: "phone", label: "Phone Number", type: "tel", required: true },
          { key: "email", label: "Email ID", type: "email", required: false },
          { key: "taluk", label: "Taluk", type: "text", required: true },
          { key: "state", label: "State", type: "text", default: "Tamil Nadu", required: true },
        ]},
        { title: "Issue Details", fields: [
          { key: "problem_description", label: "Problem Description", type: "textarea", required: true },
          { key: "remarks", label: "Remarks", type: "textarea", required: false },
          { key: "suggestions", label: "Suggestions", type: "textarea", required: false },
        ]},
      ],
    },
  },
  {
    code: "F08", name: "Form 8 - Product Issue",
    schema: {
      sections: [
        { title: "Customer Details", fields: [
          { key: "name", label: "Name", type: "text", required: true },
          { key: "phone", label: "Phone Number", type: "tel", required: true },
          { key: "email", label: "Email ID", type: "email", required: false },
          { key: "taluk", label: "Taluk", type: "text", required: true },
          { key: "state", label: "State", type: "text", default: "Tamil Nadu", required: true },
        ]},
        { title: "Order Details", fields: [
          { key: "order_id", label: "Order ID", type: "text", required: false },
          { key: "order_date", label: "Order Date", type: "date", required: false },
          { key: "product_name", label: "Product / Service", type: "text", required: false },
        ]},
        { title: "Issue Details", fields: [
          { key: "problem_description", label: "Problem Description", type: "textarea", required: true },
          { key: "remarks", label: "Remarks", type: "textarea", required: false },
          { key: "suggestions", label: "Suggestions", type: "textarea", required: false },
        ]},
      ],
    },
  },
  {
    code: "F09", name: "Form 9 - Service Request",
    schema: {
      sections: [
        { title: "Customer Details", fields: [
          { key: "name", label: "Name", type: "text", required: true },
          { key: "phone", label: "Phone Number", type: "tel", required: true },
          { key: "email", label: "Email ID", type: "email", required: false },
          { key: "taluk", label: "Taluk", type: "text", required: true },
          { key: "state", label: "State", type: "text", default: "Tamil Nadu", required: true },
        ]},
        { title: "Issue Details", fields: [
          { key: "problem_description", label: "Problem Description", type: "textarea", required: true },
          { key: "remarks", label: "Remarks", type: "textarea", required: false },
          { key: "suggestions", label: "Suggestions", type: "textarea", required: false },
        ]},
      ],
    },
  },
  {
    code: "F10", name: "Form 10 - Refund Request",
    schema: {
      sections: [
        { title: "Customer Details", fields: [
          { key: "name", label: "Name", type: "text", required: true },
          { key: "phone", label: "Phone Number", type: "tel", required: true },
          { key: "email", label: "Email ID", type: "email", required: false },
          { key: "taluk", label: "Taluk", type: "text", required: true },
          { key: "state", label: "State", type: "text", default: "Tamil Nadu", required: true },
        ]},
        { title: "Order Details", fields: [
          { key: "order_id", label: "Order ID", type: "text", required: true },
          { key: "order_date", label: "Order Date", type: "date", required: false },
          { key: "amount", label: "Amount (INR)", type: "number", required: false },
        ]},
        { title: "Issue Details", fields: [
          { key: "problem_description", label: "Problem Description", type: "textarea", required: true },
          { key: "remarks", label: "Remarks", type: "textarea", required: false },
        ]},
      ],
    },
  },
  {
    code: "F11", name: "Form 11 - Feedback / Suggestion",
    schema: {
      sections: [
        { title: "Customer Details", fields: [
          { key: "name", label: "Name", type: "text", required: true },
          { key: "phone", label: "Phone Number", type: "tel", required: false },
          { key: "email", label: "Email ID", type: "email", required: false },
          { key: "taluk", label: "Taluk", type: "text", required: true },
          { key: "state", label: "State", type: "text", default: "Tamil Nadu", required: true },
        ]},
        { title: "Feedback", fields: [
          { key: "suggestions", label: "Suggestions", type: "textarea", required: true },
          { key: "remarks", label: "Remarks", type: "textarea", required: false },
        ]},
      ],
    },
  },
];

async function seed() {
  console.log("Seeding districts...");
  for (const [code, name] of districts) {
    await query(
      `INSERT INTO districts (code, name) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      [code, name]
    );
  }

  console.log("Seeding form templates...");
  for (const t of formTemplates) {
    await query(
      `INSERT INTO form_templates (form_type_code, form_type_name, schema_json)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE form_type_name = VALUES(form_type_name), schema_json = VALUES(schema_json)`,
      [t.code, t.name, JSON.stringify(t.schema)]
    );
  }

  console.log("Seeding admin user (username: admin / password: Admin@123 - CHANGE THIS)...");
  const adminHash = await bcrypt.hash("Admin@123", 12);
  await query(
    `INSERT INTO users (username, password_hash, role, full_name, email)
     VALUES (?, ?, 'admin', 'System Administrator', 'admin@creta.gov.in')
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    ["admin", adminHash]
  );

  console.log("Seeding sample district user (username: chennai / password: Chennai@123)...");
  const districtHash = await bcrypt.hash("Chennai@123", 12);
  const [chn] = await query("SELECT id FROM districts WHERE code = 'CHN'");
  await query(
    `INSERT INTO users (username, password_hash, role, district_id, full_name, email)
     VALUES (?, ?, 'district', ?, 'Chennai District Officer', 'chennai@creta.gov.in')
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    ["chennai", districtHash, chn.id]
  );

  console.log("Seed complete.");
  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
