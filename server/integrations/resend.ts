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
  userToken: string,
  invoiceDetails: {
    supplierName: string;
    amount: string;
    date: string;
    category: string;
    description?: string | null;
    paymentType: string;
    projectName?: string | null;
    driveFileUrl: string;
    invoiceType?: string;
    invoiceNumber?: string | null;
    paymentInfo?: {
      status: string;
      firstPaymentAmount: string;
      firstPaymentDate: string;
      firstPaymentType: string;
      remainingAmount?: string;
    } | null;
  }
) {
  const { client, fromEmail } = await getUncachableResendClient();
  const appUrl = `https://factures-fp.replit.app/${userName.toLowerCase()}_${userToken}`;

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
            .button { display: inline-block; padding: 14px 28px; background-color: #157a70; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
            .button:hover { background-color: #2997aa; }
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
                <div class="detail-row">
                  <span class="detail-label">Date :</span>
                  <span class="detail-value">${invoiceDetails.date}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Catégorie :</span>
                  <span class="detail-value">${invoiceDetails.category}</span>
                </div>
                ${invoiceDetails.description ? `
                <div class="detail-row">
                  <span class="detail-label">Description :</span>
                  <span class="detail-value">${invoiceDetails.description}</span>
                </div>
                ` : ''}
                ${invoiceDetails.invoiceType ? `
                <div class="detail-row">
                  <span class="detail-label">Type :</span>
                  <span class="detail-value">${invoiceDetails.invoiceType === 'supplier_invoice' ? 'Facture Fournisseur' : 'Dépense'}</span>
                </div>
                ` : ''}
                ${invoiceDetails.invoiceNumber ? `
                <div class="detail-row">
                  <span class="detail-label">N° Facture :</span>
                  <span class="detail-value">${invoiceDetails.invoiceNumber}</span>
                </div>
                ` : ''}
                <div class="detail-row">
                  <span class="detail-label">Type de règlement :</span>
                  <span class="detail-value">${invoiceDetails.paymentType}</span>
                </div>
                ${invoiceDetails.projectName ? `
                <div class="detail-row">
                  <span class="detail-label">Projet :</span>
                  <span class="detail-value">${invoiceDetails.projectName}</span>
                </div>
                ` : ''}
                <div class="detail-row" style="border-bottom: none;">
                  <span class="detail-label">Fichier :</span>
                  <span class="detail-value"><a href="${invoiceDetails.driveFileUrl}" style="color: #157a70; text-decoration: underline;">Voir dans Google Drive</a></span>
                </div>
              </div>
              
              ${invoiceDetails.paymentInfo ? `
              <div class="details">
                <h2 style="margin-top: 0; color: #157a70;">Paiement enregistré</h2>
                <div class="detail-row">
                  <span class="detail-label">Statut :</span>
                  <span class="detail-value" style="color: ${invoiceDetails.paymentInfo.status === 'paid' ? '#22c55e' : '#f59e0b'};">${invoiceDetails.paymentInfo.status === 'paid' ? 'Payé en totalité' : 'Paiement partiel'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Montant payé :</span>
                  <span class="detail-value">${invoiceDetails.paymentInfo.firstPaymentAmount} FCFA</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Date du paiement :</span>
                  <span class="detail-value">${invoiceDetails.paymentInfo.firstPaymentDate}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Mode de paiement :</span>
                  <span class="detail-value">${invoiceDetails.paymentInfo.firstPaymentType}</span>
                </div>
                ${invoiceDetails.paymentInfo.remainingAmount ? `
                <div class="detail-row" style="border-bottom: none;">
                  <span class="detail-label">Reste à payer :</span>
                  <span class="detail-value" style="color: #f59e0b;">${invoiceDetails.paymentInfo.remainingAmount} FCFA</span>
                </div>
                ` : ''}
              </div>
              ` : ''}

              <p>Votre facture a été sauvegardée et peut être consultée dans votre espace de suivi.</p>
              
              <div style="text-align: center; margin-top: 30px;">
                <a href="${appUrl}" class="button">Accéder à mon espace</a>
              </div>
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

export async function sendPaymentConfirmation(
  toEmail: string,
  userName: string,
  userToken: string,
  paymentDetails: {
    supplierName: string;
    invoiceNumber: string | null;
    invoiceAmount: string;
    paymentAmount: string;
    paymentDate: string;
    paymentType: string;
    totalPaid: string;
    remainingAmount: string;
    paymentStatus: string;
  }
) {
  const { client, fromEmail } = await getUncachableResendClient();
  const appUrl = `https://factures-fp.replit.app/${userName.toLowerCase()}_${userToken}`;

  const statusText = paymentDetails.paymentStatus === 'paid' ? 'Facture entièrement payée' : 'Paiement partiel enregistré';
  const statusColor = paymentDetails.paymentStatus === 'paid' ? '#22c55e' : '#f59e0b';

  await client.emails.send({
    from: fromEmail,
    to: toEmail,
    subject: `${statusText} - FiltrePlante`,
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
            .button { display: inline-block; padding: 14px 28px; background-color: #157a70; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
            .button:hover { background-color: #2997aa; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
            .status-badge { display: inline-block; padding: 8px 16px; border-radius: 20px; font-weight: 600; margin: 10px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">💰 Paiement enregistré</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">FiltrePlante</p>
            </div>
            <div class="content">
              <p>Bonjour <strong>${userName}</strong>,</p>
              <p>Un nouveau paiement a été enregistré pour une facture fournisseur.</p>
              
              <div style="text-align: center; margin: 20px 0;">
                <span class="status-badge" style="background-color: ${statusColor}20; color: ${statusColor};">
                  ${statusText}
                </span>
              </div>
              
              <div class="details">
                <h2 style="margin-top: 0; color: #157a70;">Détails du paiement</h2>
                <div class="detail-row">
                  <span class="detail-label">Fournisseur :</span>
                  <span class="detail-value">${paymentDetails.supplierName}</span>
                </div>
                ${paymentDetails.invoiceNumber ? `
                <div class="detail-row">
                  <span class="detail-label">N° Facture :</span>
                  <span class="detail-value">${paymentDetails.invoiceNumber}</span>
                </div>
                ` : ''}
                <div class="detail-row">
                  <span class="detail-label">Montant total facture :</span>
                  <span class="detail-value">${paymentDetails.invoiceAmount} FCFA</span>
                </div>
                <div class="detail-row" style="background-color: #f0fdf4; margin: 0 -20px; padding: 10px 20px;">
                  <span class="detail-label">Montant du paiement :</span>
                  <span class="detail-value" style="color: #22c55e; font-size: 1.1em;">${paymentDetails.paymentAmount} FCFA</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Date du paiement :</span>
                  <span class="detail-value">${paymentDetails.paymentDate}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Mode de paiement :</span>
                  <span class="detail-value">${paymentDetails.paymentType}</span>
                </div>
              </div>

              <div class="details">
                <h2 style="margin-top: 0; color: #157a70;">Récapitulatif</h2>
                <div class="detail-row">
                  <span class="detail-label">Total payé :</span>
                  <span class="detail-value" style="color: #22c55e;">${paymentDetails.totalPaid} FCFA</span>
                </div>
                <div class="detail-row" style="border-bottom: none;">
                  <span class="detail-label">Reste à payer :</span>
                  <span class="detail-value" style="color: ${parseFloat(paymentDetails.remainingAmount.replace(/\s/g, '').replace(',', '.')) > 0 ? '#f59e0b' : '#22c55e'};">${paymentDetails.remainingAmount} FCFA</span>
                </div>
              </div>
              
              <div style="text-align: center; margin-top: 30px;">
                <a href="${appUrl}" class="button">Voir dans mon espace</a>
              </div>
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
