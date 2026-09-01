// --- LÓGICA DEL PIN ---
let pinActual = "";
let html5QrcodeScanner = null;

function addPin(num) {
  if (pinActual.length < 4) {
    pinActual += num;
    actualizarDots();
    if (pinActual.length === 4) verificarPin();
  }
}

function clearPin() {
  pinActual = "";
  actualizarDots();
}

function actualizarDots() {
  const dots = document.querySelectorAll('.pin-dot');
  dots.forEach((dot, i) => { dot.className = i < pinActual.length ? 'pin-dot filled' : 'pin-dot'; });
}

async function verificarPin() {
  if (pinActual === "1234") {
    document.getElementById('pin-screen').style.display = 'none';
    document.getElementById('caja-layout').style.display = 'block';
    initNFC();
    initQR();
  } else {
    setTimeout(() => { alert("PIN Incorrecto"); clearPin(); }, 100);
  }
}

// --- LÓGICA DE AUDIO ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playBeep(tipo) {
  const osc = audioCtx.createOscillator();
  osc.connect(audioCtx.destination);
  osc.frequency.setValueAtTime(tipo === 'ok' ? 880 : 300, audioCtx.currentTime);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.15);
}

// --- LÓGICA CÁMARA QR ---
function initQR() {
  html5QrcodeScanner = new Html5QrcodeScanner(
    "reader",
    { fps: 10, qrbox: { width: 200, height: 200 }, rememberLastUsedCamera: true },
    false
  );
  html5QrcodeScanner.render(onScanSuccess);
}

async function onScanSuccess(decodedText) {
  if (html5QrcodeScanner) html5QrcodeScanner.pause(); // Pausamos cámara mientras cobra
  let code = decodedText.includes('?code=') ? decodedText.split('?code=')[1] : decodedText;
  try { code = decodeURIComponent(code); } catch (e) { }
  playBeep('ok');
  document.getElementById('status-nfc').innerHTML = "⏳ Buscando QR...";
  await consultarAtleta(code.trim());
}

// --- LÓGICA NFC ---
// Tabla oficial de prefijos URI del estándar NDEF
const NDEF_URI_PREFIXES_CAJA = [
  '', 'http://www.', 'https://www.', 'http://', 'https://',
  'tel:', 'mailto:', 'ftp://anonymous:anonymous@', 'ftp://ftp.',
  'ftps://', 'sftp://', 'smb://', 'nfs://', 'ftp://', 'dav://',
  'news:', 'telnet://', 'imap:', 'rtsp://', 'urn:', 'pop:', 'sip:',
  'sips:', 'tftp:', 'btspp://', 'btl2cap://', 'btgoep://',
  'tcpobex://', 'irdaobex://', 'file://', 'urn:epc:id:',
  'urn:epc:tag:', 'urn:epc:pat:', 'urn:epc:raw:', 'urn:epc:', 'urn:nfc:',
];

function _cajaNfcExtract(record) {
  let fullText = null;
  try {
    if (record.recordType === 'url') {
      const bytes = new Uint8Array(record.data.buffer, record.data.byteOffset, record.data.byteLength);
      const prefix = NDEF_URI_PREFIXES_CAJA[bytes[0]] ?? '';
      fullText = prefix + new TextDecoder('utf-8').decode(bytes.slice(1)).trim();
    } else if (record.recordType === 'text') {
      const bytes = new Uint8Array(record.data.buffer, record.data.byteOffset, record.data.byteLength);
      const langLen = bytes[0] & 0x3F;
      const charset = (bytes[0] & 0x80) ? 'utf-16' : 'utf-8';
      fullText = new TextDecoder(charset).decode(bytes.slice(1 + langLen)).trim();
    } else {
      fullText = new TextDecoder(record.encoding || 'utf-8').decode(record.data)
        .replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
    }
  } catch { return null; }

  if (!fullText) return null;
  if (fullText.startsWith('http://') || fullText.startsWith('https://')) {
    try {
      const url = new URL(fullText);
      const p = url.searchParams.get('code');
      if (p) return decodeURIComponent(p);
    } catch { /* fallback */ }
    const idx = fullText.indexOf('?code=');
    if (idx !== -1) return decodeURIComponent(fullText.slice(idx + 6));
    return null;
  }
  if (fullText.startsWith('JRS:') || fullText.startsWith('STU-')) return fullText;
  if (fullText.includes('?code=')) return decodeURIComponent(fullText.split('?code=')[1]);
  return null;
}

async function initNFC() {
  if (!('NDEFReader' in window)) return;
  try {
    const ndef = new NDEFReader();
    await ndef.scan();
    ndef.addEventListener('reading', async ({ message }) => {
      for (const record of message.records) {
        const code = _cajaNfcExtract(record);
        if (!code) continue;
        // Pausar cámara QR mientras se procesa el NFC (igual que QR path)
        try { if (html5QrcodeScanner) html5QrcodeScanner.pause(); } catch (e) { /* ya pausado */ }
        playBeep('ok');
        document.getElementById('status-nfc').innerHTML = '⏳ Buscando NFC...';
        await consultarAtleta(code);
        break; // primer record válido
      }
    });
  } catch (e) { console.warn('NFC Error', e); }
}

// --- LÓGICA DE COBRO (AMBOS MÉTODOS) ---
let alumnoActual = null;

async function consultarAtleta(code) {
  try {
    let studentId = null;
    const cleanCode = code.trim();
    const supabase = window.supabaseClient;

    if (cleanCode.startsWith("JRS:")) {
      const parts = cleanCode.substring(4).split(":");
      if (parts.length !== 4) throw new Error("QR JRS inválido");
      const shortId = parts[0];

      let { data: credData } = await supabase
        .from('credentials')
        .select('student_id')
        .like('code', `JRS:${shortId}:%`)
        .eq('is_active', true)
        .limit(1);
      
      if (credData && credData.length > 0) {
        studentId = credData[0].student_id;
      } else {
        let { data: stuData } = await supabase
          .from('students')
          .select('id')
          .ilike('id', `${shortId}%`)
          .eq('is_active', true)
          .limit(1);
        
        if (stuData && stuData.length > 0) {
          studentId = stuData[0].id;
        }
      }
    } else {
      let { data: credData } = await supabase
        .from('credentials')
        .select('student_id')
        .eq('code', cleanCode)
        .eq('is_active', true)
        .limit(1);
        
      if (credData && credData.length > 0) {
        studentId = credData[0].student_id;
      }
    }

    if (!studentId) throw new Error("Credencial inválida o alumno inactivo");

    const { data: studentData, error: stuError } = await supabase
      .from('students')
      .select('id, full_name, batido_credits')
      .eq('id', studentId)
      .eq('is_active', true)
      .single();

    if (stuError || !studentData) throw new Error("Alumno no encontrado");

    alumnoActual = {
      id: studentData.id,
      name: studentData.full_name,
      batido_credits: studentData.batido_credits
    };

    document.getElementById('c-nombre').textContent = alumnoActual.name;
    document.getElementById('c-num').textContent = alumnoActual.batido_credits ?? 0;

    document.getElementById('cliente-box').classList.add('active');
    document.getElementById('menu-grid').classList.add('active');
    document.getElementById('status-nfc').innerHTML = "✅ Listo para cobrar";

  } catch (error) {
    console.log("Error en Caja:", error);
    playBeep('error');
    document.getElementById('status-nfc').innerHTML = "❌ Código no registrado o Vencido";
    setTimeout(resetCaja, 2000);
  }
}

async function cobrar(nombreBatido, costo, emoji) {
  if (!alumnoActual) return;
  if (alumnoActual.batido_credits < costo) {
    playBeep('error');
    alert("❌ Saldo insuficiente");
    return;
  }

  document.getElementById('menu-grid').classList.remove('active');
  document.getElementById('status-nfc').innerHTML = "💸 Cobrando...";

  try {
    const supabase = window.supabaseClient;
    const { data, error } = await supabase.rpc('canjear_batido', {
      p_student_id: alumnoActual.id,
      p_batido_name: nombreBatido,
      p_credits_used: costo,
      p_emoji: emoji
    });

    if (error || (data && !data.ok)) {
      throw new Error(error ? error.message : (data.message || "Error en el canje"));
    }

    playBeep('ok');
    alumnoActual.batido_credits -= costo;
    document.getElementById('c-num').textContent = alumnoActual.batido_credits;
    document.getElementById('status-nfc').innerHTML = "✅ ¡Cobrado! Pasa otro atleta.";

    setTimeout(resetCaja, 3000);

  } catch (err) {
    playBeep('error');
    alert(err.message || "Error en el servidor");
    document.getElementById('menu-grid').classList.add('active');
  }
}

function resetCaja() {
  alumnoActual = null;
  document.getElementById('cliente-box').classList.remove('active');
  document.getElementById('menu-grid').classList.remove('active');
  document.getElementById('status-nfc').innerHTML = "📡 Esperando NFC o QR...";
  // Scanner no se pausa explícitamente.
}