// Reference: resend blueprint
import { Resend } from 'resend';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key)) {
    throw new Error('Resend not connected');
  }
  return {apiKey: connectionSettings.settings.api_key, fromEmail: connectionSettings.settings.from_email};
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
// Always call this function again to get a fresh client.
export async function getUncachableResendClient() {
  const credentials = await getCredentials();
  return {
    client: new Resend(credentials.apiKey),
    fromEmail: credentials.fromEmail
  };
}

export async function sendInvoiceConfirmation(
  toEmail: string,
  userName: string,
  invoiceDetails: {
    supplierName: string;
    amount: string;
    date: string;
  }
) {
  const { client, fromEmail } = await getUncachableResendClient();

  await client.emails.send({
    from: fromEmail,
    to: toEmail,
    subject: 'Confirmation de soumission de facture - FiltrePlante',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Inter, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #157a70; color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background-color: #f9f9f9; padding: 30px 20px; }
            .details { background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
            .detail-label { font-weight: 600; color: #666; }
            .detail-value { color: #157a70; font-weight: 600; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">✓ Facture soumise avec succès</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">FiltrePlante</p>
            </div>
            <div class="content">
              <p>Bonjour <strong>${userName}</strong>,</p>
              <p>Votre facture a été soumise avec succès et enregistrée dans le système.</p>
              
              <div class="details">
                <h2 style="margin-top: 0; color: #157a70;">Détails de la facture</h2>
                <div class="detail-row">
                  <span class="detail-label">Fournisseur :</span>
                  <span class="detail-value">${invoiceDetails.supplierName}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Montant TTC :</span>
                  <span class="detail-value">${invoiceDetails.amount} FCFA</span>
                </div>
                <div class="detail-row" style="border-bottom: none;">
                  <span class="detail-label">Date :</span>
                  <span class="detail-value">${invoiceDetails.date}</span>
                </div>
              </div>

              <p>Votre facture a été sauvegardée et peut être consultée dans votre espace de suivi.</p>
            </div>
            <div class="footer">
              <p>Cet email a été envoyé automatiquement par FiltrePlante</p>
              <p style="color: #999; font-size: 12px;">© ${new Date().getFullYear()} FiltrePlante. Tous droits réservés.</p>
            </div>
          </div>
        </body>
      </html>
    `,
  });
}
