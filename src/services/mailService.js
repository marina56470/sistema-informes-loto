const nodemailer  = require('nodemailer');
const htmlPdf    = require('html-pdf-node');
const path       = require('path');
const fs         = require('fs');
require('dotenv').config();

// ── Mailer ────────────────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtFecha(d) {
  if (!d) return '—';
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio',
                 'agosto','septiembre','octubre','noviembre','diciembre'];
  const dt = new Date(d);
  return `${dt.getDate()} de ${meses[dt.getMonth()]} ${dt.getFullYear()}`;
}

const ENERGIAS_STYLE = {
  'Eléctrica':  'background:#FFF8E1;color:#E65100',
  'Mecánica':   'background:#F3E5F5;color:#6A1B9A',
  'Neumática':  'background:#E8F5E9;color:#1B5E20',
  'Hidráulica': 'background:#E3F2FD;color:#0D47A1',
  'Térmica':    'background:#FBE9E7;color:#BF360C',
  'Química':    'background:#FFEBEE;color:#B71C1C',
};

// ── Construir el HTML completo del informe para convertirlo a PDF ─────────────
function buildReportHTML(informe, hallazgos) {
  const tableRows = hallazgos.map((h, i) => {
    const energias = typeof h.energias  === 'string' ? JSON.parse(h.energias)  : (h.energias  || []);
    const prods    = typeof h.productos === 'string' ? JSON.parse(h.productos) : (h.productos || []);

    const energiasHTML = energias.map(e =>
      `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-weight:700;font-size:10px;margin:2px;${ENERGIAS_STYLE[e] || ''}">${e}</span>`
    ).join('');

    const fotoHTML = h.foto_path
      ? `<img src="${process.env.APP_URL}${h.foto_path}"
              style="max-width:150px;max-height:100px;border:1px solid #ddd;border-radius:3px;display:block;margin:0 auto;">`
      : `<div style="width:150px;height:90px;background:#f5f5f5;border:1px dashed #ccc;display:flex;align-items:center;justify-content:center;font-size:11px;color:#aaa;margin:0 auto;border-radius:3px;">Sin foto</div>`;

    const prodsHTML = prods.map(p => `
      <div style="margin-bottom:5px;padding:5px 7px;background:#FFFBE6;border-left:3px solid #F5C800;border-radius:3px;display:flex;align-items:center;gap:7px;">
        ${p.foto_url ? `<img src="${process.env.APP_URL}${p.foto_url}" style="width:42px;height:42px;max-width:42px;max-height:42px;object-fit:contain;flex-shrink:0;border:1px solid #eee;border-radius:4px;padding:2px;background:#fff;">` : ''}
        <div style="flex:1;min-width:0;">
          <div style="font-family:monospace;font-weight:700;color:#1A1A1A;font-size:10px;">SKU ${p.sku}</div>
          <div style="font-weight:700;font-size:11px;margin-top:1px;line-height:1.25;">${p.nombre}</div>
        </div>
      </div>
    `).join('');

    const nota = h.recomendaciones
      ? `<div style="margin-top:6px;font-size:10px;color:#444;padding:4px 6px;background:#fffde7;border-left:2px solid #F5C800;"><strong>Nota:</strong> ${h.recomendaciones}</div>`
      : '';

    return `
      <tr>
        <td style="width:110px;text-align:center;vertical-align:top;padding:10px;">
          <strong style="color:#1A1A1A;font-size:11px;">${h.proceso || '—'}</strong>
        </td>
        <td style="width:120px;font-weight:600;vertical-align:top;padding:10px;font-size:11px;">${h.area}</td>
        <td style="vertical-align:top;padding:10px;font-size:11px;line-height:1.5;">${h.descripcion}</td>
        <td style="width:110px;vertical-align:top;padding:10px;">${energiasHTML}</td>
        <td style="width:170px;text-align:center;vertical-align:top;padding:10px;">${fotoHTML}</td>
        <td style="vertical-align:top;padding:10px;">${prodsHTML}${nota}</td>
      </tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Informe LOTO — ${informe.empresa || 'Cliente'}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #1a1a1a; background: #fff; }
    .report-header {
      background: #1A1A1A;
      padding: 18px 28px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 4px solid #F5C800;
    }
    .header-logo { font-weight:900; font-size:1.5rem; color:#F5C800; letter-spacing:3px; }
    .header-sub  { color:rgba(255,255,255,.7); font-size:.6rem; letter-spacing:1px; margin-top:2px; }
    .header-right { text-align:right; color:#fff; }
    .header-right h2 { font-size:.85rem; font-weight:700; }
    .header-right p  { font-size:.65rem; opacity:.75; }

    .cover { padding: 24px 28px; border-bottom: 2px solid #e5e5e5; }
    .cover-date { font-size:.82rem; color:#555; margin-bottom:.75rem; }
    .cover-recipient { margin-bottom:1rem; }
    .cover-recipient strong { color:#1A1A1A; }
    .body-text { font-size:.78rem; line-height:1.7; color:#333; margin-bottom:.6rem; text-align:justify; }

    .section-title {
      background: #1A1A1A;
      color: #F5C800;
      padding: 8px 16px;
      font-weight:700; font-size:.75rem;
      letter-spacing:1.5px; text-transform:uppercase;
      border-left: 4px solid #F5C800;
    }

    table { width:100%; border-collapse:collapse; font-size:.72rem; }
    thead th {
      background: #1A1A1A; color: #F5C800;
      padding: 9px 10px; text-align:left;
      font-size:.65rem; text-transform:uppercase; font-weight:700;
    }
    tbody td { border:1px solid #ddd; vertical-align:top; color:#222; }
    tbody tr:nth-child(even) td { background:#f9f9f9; }

    .notes { padding:18px 28px; border-top:1px solid #e5e5e5; }
    .notes h3 { color:#1A1A1A; font-size:.82rem; margin-bottom:.6rem; }
    .notes ol { padding-left:1.2rem; }
    .notes li { font-size:.72rem; color:#333; margin-bottom:.4rem; line-height:1.5; }

    .signature { padding:18px 28px 24px; border-top:1px solid #e5e5e5; }
    .signature p { font-size:.75rem; color:#333; margin-bottom:.3rem; }

    .footer {
      background: #1A1A1A;
      border-top: 3px solid #F5C800;
      padding: 10px 28px;
      display: flex;
      align-items:center;
      justify-content:space-between;
    }
    .footer p { font-size:.6rem; color:rgba(255,255,255,.6); }
    .footer-conf { font-size:.58rem; color:#F5C800; letter-spacing:1px; text-transform:uppercase; }
  </style>
</head>
<body>
  <div class="report-header">
    <div>
      <div class="header-logo">ASSA ABLOY</div>
      <div class="header-sub">COLOMBIA S.A.S.</div>
    </div>
    <div class="header-right">
      <h2>INFORME DE CONTROL DE ENERGÍAS PELIGROSAS</h2>
      <p>Bloqueo y Etiquetado — Yale LOTO Solutions</p>
    </div>
  </div>

  <div class="cover">
    <div class="cover-date">Barranquilla, ${fmtFecha(informe.fecha_informe)}</div>
    <div class="cover-recipient">
      <p>Señores</p>
      <p><strong>${informe.empresa || 'EMPRESA CLIENTE'}</strong></p>
      ${informe.contacto     ? `<p>Atn. ${informe.contacto}${informe.cargo_contacto ? ' — ' + informe.cargo_contacto : ''}</p>` : ''}
      ${informe.ciudad       ? `<p>${informe.ciudad}</p>` : ''}
      <br><p>Respetados Señores.</p>
    </div>
    <p class="body-text">ASSA ABLOY COLOMBIA, en su compromiso continuo con el fortalecimiento de la cultura de seguridad industrial y la optimización de los procesos operativos de sus clientes, desarrolla e implementa soluciones técnicas orientadas al control efectivo de energías peligrosas en entornos industriales.</p>
    ${informe.fecha_visita ? `<p class="body-text">En ese contexto, el pasado <strong>${fmtFecha(informe.fecha_visita)}</strong> se llevó a cabo una visita técnica a las instalaciones de <strong>${informe.empresa}</strong>, donde se realizó un recorrido exhaustivo por las diferentes áreas operativas.</p>` : ''}
    <p class="body-text">El presente informe tiene como objetivo documentar las energías peligrosas presentes en su planta y recomendar los dispositivos de bloqueo y etiquetado requeridos para cada punto de intervención.</p>
  </div>

  <div class="section-title">
    INFORME DE RECORRIDO — ${(informe.empresa || '').toUpperCase()} ${informe.ciudad ? '— ' + informe.ciudad.toUpperCase() : ''}
  </div>
  <table>
    <thead>
      <tr>
        <th>PROCESO</th><th>ÁREA</th><th>HALLAZGOS</th>
        <th>ENERGÍAS PELIGROSAS</th><th>REGISTRO FOTOGRÁFICO</th>
        <th>RECOMENDACIONES (SKU Yale)</th>
      </tr>
    </thead>
    <tbody>
      ${hallazgos.length ? tableRows : '<tr><td colspan="6" style="text-align:center;padding:20px;color:#999;">Sin hallazgos registrados</td></tr>'}
    </tbody>
  </table>

  <div class="notes">
    <h3>📋 NOTAS TÉCNICAS ADICIONALES</h3>
    <ol>
      <li>Los dispositivos sugeridos son recomendación de ASSA ABLOY COLOMBIA. La responsabilidad final de selección e implementación es de <strong>${informe.empresa || 'la empresa cliente'}</strong>.</li>
      <li>Para bloqueo eléctrico se utilizarán candados con gancho en nylon dieléctricos; para bloqueo mecánico se sugiere candados con gancho metálico o nylon.</li>
      <li>Para tableros de control se recomienda dispositivos de bloqueo múltiple (SKU 0016016, 0001171, 0009711) y estaciones de bloqueo (SKU 0001170).</li>
      <li>Los dispositivos deben contar con tarjetas de etiquetado (SKU 0001177) que identifiquen al responsable, motivo y fecha de finalización.</li>
      <li>Conforme a la Norma RETIE, la instalación en tableros eléctricos debe ser realizada por un Técnico Eléctrico con certificación CONTE.</li>
      <li>ASSA ABLOY COLOMBIA ofrece programas de capacitación práctica en control de energías peligrosas, sin costo, previa coordinación.</li>
      <li>El código de colores de candados debe ser definido según el programa LOTO interno de <strong>${informe.empresa || 'la empresa'}</strong>.</li>
    </ol>
  </div>

  ${informe.notas_comerciales ? `
  <div class="notes" style="border-top:1px solid #e5e5e5;">
    <h3>📦 NOTA COMERCIAL</h3>
    <p style="font-size:.75rem;color:#333;">${informe.notas_comerciales}</p>
  </div>` : ''}

  <div class="signature">
    <p>Agradecemos la confianza depositada en <strong>ASSA ABLOY COLOMBIA</strong> y quedamos atentos a cualquier requerimiento adicional.</p>
    <br><p>Saludos Cordiales.</p><br><br>
    <p><strong>${informe.ejecutivo || ''}</strong></p>
    <p>Ejecutivo Comercial ${informe.zona || ''}</p>
    <p><strong>ASSA ABLOY COLOMBIA S.A.S.</strong></p>
    <p>Calle 12 N° 32-39, Bogotá D.C., Colombia — Teléfono: +601 5962000</p>
  </div>

  <div class="footer">
    <p>© ${new Date().getFullYear()} ASSA ABLOY Colombia S.A.S. — Yale LOTO Solutions</p>
    <span class="footer-conf">Documento Confidencial</span>
  </div>
</body>
</html>`;
}

// ── Generar PDF como Buffer ───────────────────────────────────────────────────
async function generarPDF(informe, hallazgos) {
  const html  = buildReportHTML(informe, hallazgos);
  const file  = { content: html };
  const opts  = {
    format: 'A4',
    margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' },
    printBackground: true,
    // Flags necesarios para que Puppeteer/Chrome corra dentro de contenedores
    // como los de Render, que no dan permisos de sandbox a root.
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  };
  const buffer = await htmlPdf.generatePdf(file, opts);
  return buffer;
}

// ── Enviar el informe por correo ──────────────────────────────────────────────
async function enviarInforme({ informe, hallazgos, emailDestino, emailCC, mensajePersonal }) {
  const pdfBuffer = await generarPDF(informe, hallazgos);
  const empresa   = informe.empresa || 'Cliente';
  const fecha     = fmtFecha(informe.fecha_informe);
  const ejecutivo = informe.ejecutivo || 'Ejecutivo Comercial';
  const zona      = informe.zona      || '';
  const nombreArchivo = `Informe_LOTO_${empresa.replace(/\s+/g,'_')}_${new Date().toISOString().split('T')[0]}.pdf`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
      <!-- Header -->
      <div style="background:#1A1A1A;padding:20px 28px;border-bottom:4px solid #F5C800;">
        <div style="font-weight:900;font-size:1.4rem;color:#F5C800;letter-spacing:3px;">ASSA ABLOY</div>
        <div style="color:rgba(255,255,255,.6);font-size:.6rem;letter-spacing:1px;margin-top:2px;">COLOMBIA S.A.S.</div>
      </div>

      <!-- Body -->
      <div style="padding:28px;background:#fff;border:1px solid #e5e5e5;border-top:none;">
        <h2 style="color:#1A1A1A;font-size:1rem;margin-bottom:.5rem;">
          Informe de Control de Energías Peligrosas
        </h2>
        <p style="color:#555;font-size:.82rem;margin-bottom:1.5rem;">
          Barranquilla, ${fecha}
        </p>

        ${mensajePersonal ? `
        <div style="background:#FFFBE6;border-left:4px solid #F5C800;padding:12px 16px;border-radius:4px;margin-bottom:1.5rem;">
          <p style="color:#333;font-size:.82rem;line-height:1.6;margin:0;">${mensajePersonal}</p>
        </div>` : ''}

        <p style="color:#333;font-size:.82rem;line-height:1.7;margin-bottom:1rem;">
          Estimados señores de <strong>${empresa}</strong>,
        </p>
        <p style="color:#333;font-size:.82rem;line-height:1.7;margin-bottom:1rem;">
          Adjunto encontrarán el informe técnico de identificación de energías peligrosas
          correspondiente a la visita realizada a sus instalaciones. Este documento incluye
          el detalle de los puntos de bloqueo identificados y las recomendaciones de
          dispositivos Yale LOTO para cada uno.
        </p>
        <p style="color:#333;font-size:.82rem;line-height:1.7;margin-bottom:1.5rem;">
          Quedamos atentos a cualquier inquietud o requerimiento adicional.
        </p>

        <!-- Stats rápidos -->
        <div style="display:flex;gap:12px;margin-bottom:1.5rem;">
          <div style="flex:1;background:#f5f5f5;border-radius:6px;padding:12px;text-align:center;border-top:3px solid #F5C800;">
            <div style="font-size:1.5rem;font-weight:900;color:#1A1A1A;">${hallazgos.length}</div>
            <div style="font-size:.65rem;color:#666;text-transform:uppercase;letter-spacing:.5px;">Puntos de bloqueo</div>
          </div>
          <div style="flex:1;background:#f5f5f5;border-radius:6px;padding:12px;text-align:center;border-top:3px solid #1A1A1A;">
            <div style="font-size:1.5rem;font-weight:900;color:#1A1A1A;">
              ${hallazgos.reduce((acc,h) => {
                const p = typeof h.productos === 'string' ? JSON.parse(h.productos) : (h.productos||[]);
                return acc + p.length;
              }, 0)}
            </div>
            <div style="font-size:.65rem;color:#666;text-transform:uppercase;letter-spacing:.5px;">Dispositivos recomendados</div>
          </div>
        </div>

        <p style="color:#888;font-size:.72rem;border-top:1px solid #eee;padding-top:1rem;margin-top:1rem;">
          📎 Se adjunta el informe en formato PDF listo para imprimir.
        </p>
      </div>

      <!-- Footer -->
      <div style="background:#1A1A1A;padding:12px 28px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="color:#F5C800;font-weight:700;font-size:.78rem;">${ejecutivo}</div>
          <div style="color:rgba(255,255,255,.5);font-size:.65rem;">Ejecutivo Comercial ${zona}</div>
        </div>
        <div style="color:rgba(255,255,255,.4);font-size:.6rem;text-align:right;">
          ASSA ABLOY COLOMBIA S.A.S.<br>
          +601 5962000
        </div>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from:        `"${ejecutivo} — ASSA ABLOY" <${process.env.MAIL_USER}>`,
    to:          emailDestino,
    cc:          emailCC || undefined,
    subject:     `📋 Informe LOTO — ${empresa} — ${fecha}`,
    html,
    attachments: [{
      filename:    nombreArchivo,
      content:     pdfBuffer,
      contentType: 'application/pdf',
    }],
  });

  return nombreArchivo;
}

module.exports = { enviarInforme, generarPDF };