// Algoritma CRC16-CCITT (Poly: 0x1021, Init: 0xFFFF)
function calculateCRC16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    crc ^= (c << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Fungsi Parsing TLV (Tag-Length-Value)
function parseTLV(qrisStr) {
  const tags = [];
  let pos = 0;
  while (pos < qrisStr.length) {
    if (pos + 4 > qrisStr.length) break;
    const tag = qrisStr.substr(pos, 2);
    const len = parseInt(qrisStr.substr(pos + 2, 2), 10);
    if (isNaN(len) || pos + 4 + len > qrisStr.length) break;
    const value = qrisStr.substr(pos + 4, len);
    tags.push({ tag, len, value });
    pos += 4 + len;
  }
  return tags;
}

// Fungsi Utama Generator Dynamic QRIS
function generateDynamicQRIS(baseQr, amount) {
  let tags = parseTLV(baseQr.trim());
  
  // Hapus Tag 63 (CRC) dan Tag 54 (Amount lama jika ada)
  tags = tags.filter(item => item.tag !== '63' && item.tag !== '54');

  const amtStr = amount.toString();
  const tag54 = {
    tag: '54',
    len: amtStr.length,
    value: amtStr
  };

  // Sisipkan Tag 54 setelah Tag 53 (Transaction Currency)
  const index53 = tags.findIndex(item => item.tag === '53');
  if (index53 !== -1) {
    tags.splice(index53 + 1, 0, tag54);
  } else {
    const index58 = tags.findIndex(item => item.tag === '58');
    if (index58 !== -1) {
      tags.splice(index58, 0, tag54);
    } else {
      tags.push(tag54);
    }
  }

  // Re-build Payload String
  let payload = "";
  tags.forEach(item => {
    const lenStr = item.len.toString().padStart(2, '0');
    payload += `${item.tag}${lenStr}${item.value}`;
  });

  // Tambahkan Header CRC
  payload += "6304";
  const checksum = calculateCRC16(payload);
  return payload + checksum;
}

export default async function handler(req, res) {
  // Pengaturan CORS Header
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    const { amount } = req.body;
    const numericAmount = Number(amount);

    if (!numericAmount || numericAmount < 10000) {
      return res.status(400).json({ 
        success: false, 
        message: 'Minimal deposit adalah Rp 10.000' 
      });
    }

    // Mengambil dari Environment Variable / Fallback Static String
    const rawStaticQris = process.env.STATIC_QRIS || "00020101021126610014COM.GO-JEK.WWW01189360091430102013260210G0102013260303UMI51440014ID.CO.QRIS.WWW0215ID10243540049380303UMI5204581653033605802ID5916DCOMPANY, GAMING6013JAKARTA PUSAT61051031062070703A0163044950";

    const dynamicPayload = generateDynamicQRIS(rawStaticQris, numericAmount);

    return res.status(200).json({
      success: true,
      amount: numericAmount,
      payload: dynamicPayload,
      qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(dynamicPayload)}`
    });

  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: 'Gagal membuat QRIS', 
      error: error.message 
    });
  }
}
