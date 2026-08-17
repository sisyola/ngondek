// Algoritma CRC16-CCITT
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

// TLV Parser
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

// Core Generator
function generateDynamicQRIS(baseQr, amount) {
  let tags = parseTLV(baseQr.trim());
  tags = tags.filter(item => item.tag !== '63' && item.tag !== '54');

  const amtStr = amount.toString();
  const tag54 = { tag: '54', len: amtStr.length, value: amtStr };

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

  let payload = "";
  tags.forEach(item => {
    const lenStr = item.len.toString().padStart(2, '0');
    payload += `${item.tag}${lenStr}${item.value}`;
  });

  payload += "6304";
  return payload + calculateCRC16(payload);
}

export default async function handler(req, res) {
  // CORS Header biar bisa dipanggil dari web mana aja
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const amount = req.query.amount || (req.body && req.body.amount);
  const numericAmount = Number(amount);

  if (!numericAmount || numericAmount < 20000) {
    return res.status(400).json({ success: false, message: 'MINIMAL DEPOSIT RP 20.000' });
  }

  // QRIS STATIS DIAMBIL DARI ENV VERCEL (AMAN DARI MATA-MATA)
  const RAW_STATIC_QRIS = process.env.RAW_STATIC_QRIS;

  if (!RAW_STATIC_QRIS) {
    return res.status(500).json({ success: false, message: 'QRIS Static Env belum diisi!' });
  }

  try {
    const dynamicPayload = generateDynamicQRIS(RAW_STATIC_QRIS, numericAmount);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(dynamicPayload)}`;

    return res.status(200).json({
      success: true,
      amount: numericAmount,
      qrUrl: qrUrl
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Gagal generate QRIS' });
  }
}
