# hebbClientEmail.py

import os
import csv
import re
import time
import boto3
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage

# ─── CONFIG ──────────────────────────────────────────────────────────────────
AWS_PROFILE = "ses-local-user"
AWS_REGION  = "us-east-1"

CSV_PATH    = r"C:\Users\arodriguez\Documents\Projects\sousan\production\aws-ses\emailList\hebbClientEmails.csv"

# Local image files (banner + signature) – these are embedded and referenced via CID
BANNER_FILE = r"C:\Users\arodriguez\Documents\Projects\sousan\production\aws-ses\Image\ssLetterHeadGeneral.png"
SIG_FILE    = r"C:\Users\arodriguez\Documents\Projects\sousan\production\aws-ses\Image\sig_logo_black_letters.png"

# Content IDs used in HTML <img src="cid:...">
BANNER_CID  = "bannerlogo"
SIG_CID     = "siglogo"

FROM_EMAIL  = "Southern Sanitation <info@southernsanitation.com>"
SUBJECT     = "Notice of City of Laredo Landfill Fee Adjustment — Effective October 1, 2025"

# ─── AWS SESSION / SES ───────────────────────────────────────────────────────
session = boto3.session.Session(profile_name=AWS_PROFILE, region_name=AWS_REGION)
ses = session.client("ses")

# ─── BODY BUILDERS (Lambda-like structure) ───────────────────────────────────
def build_plain() -> str:
    return (
        "Dear Valued Client,\n\n"
        "Effective October 1, 2025, the City of Laredo will increase the landfill disposal rate. "
        "As a result, the City of Laredo Landfill (COL) fee will be $51.50 per ton, pursuant to a city‑mandated adjustment.\n\n"
        "How this affects your invoice:\n"
        "• Roll‑off services: The COL fee increase will be reflected on invoices issued on or after October 1, 2025.\n"
        "• Front‑load services: Invoices may also reflect a corresponding adjustment, where applicable.\n\n"
        "Thank you for choosing Southern Sanitation for your waste management needs.\n\n"
        "Southern Sanitation\n"
        "--\n"
        "Address: 1202 Houston St. Ste. 200 Laredo, TX 78040\n"
        "Phone: (956) 723-3333\n"
        "Office Hours: Monday - Friday, 8 AM - 5 PM\n\n"
        "Disclaimer: This email is intended for the person or entity to which it is addressed and may contain "
        "confidential information. If you have received this email in error, please notify the sender immediately "
        "and delete it from your system.\n\n"
        "If you no longer wish to receive these emails, please email us at unsubscribe@southernsanitation.com.\n"
    )

def build_html() -> str:
    # Header and body remain, footer rebuilt with tables and no margins for Outlook
    return f"""\
<html>
  <head>
    <meta name="color-scheme" content="only light" />
    <meta name="supported-color-schemes" content="light" />
  </head>
  <body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#ffffff!important;color:#333;">

    <!-- Full-width green banner background -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="border-collapse:collapse;background:#01634e;mso-table-lspace:0;mso-table-rspace:0;">
      <tr>
        <td align="center" style="padding:0;Margin:0;">

          <!--[if mso]>
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0">
            <tr><td>
          <![endif]-->

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="border-collapse:collapse;width:100%;max-width:600px;mso-table-lspace:0;mso-table-rspace:0;">
            <tr>
              <td style="padding:0;Margin:0;">
                <img src="cid:{BANNER_CID}"
                     alt="Southern Sanitation"
                     width="600"
                     style="display:block;border:0;outline:none;text-decoration:none;width:100%;max-width:600px;height:auto;line-height:0;-ms-interpolation-mode:bicubic;">
              </td>
            </tr>
          </table>

          <!--[if mso]>
            </td></tr>
          </table>
          <![endif]-->

        </td>
      </tr>
    </table>

    <!-- Content -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
      <tr>
        <td align="center" style="padding:0 10px;">
          <!--[if mso]>
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td>
          <![endif]-->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;border-collapse:collapse;">
            <tr>
              <td style="padding:16px 5px 0 5px;">
                <p style="font-size:16px; line-height:1.6; margin:0 0 12px 0;"><strong>Dear Valued Client,</strong></p>

                <p style="font-size:16px; line-height:1.6; margin:0 0 12px 0;">
                  Effective October 1, 2025, the City of Laredo will increase the landfill disposal rate.
                  As a result, the City of Laredo Landfill (COL) fee will be <strong>$51.50 per ton</strong>, pursuant to a city‑mandated adjustment.
                </p>

                <p style="font-size:16px; line-height:1.6; margin:0;"><strong>How this affects your invoice:</strong></p>
                <ul style="font-size:16px; line-height:1.6; padding-left:20px; margin:8px 0 12px 20px;">
                  <li><strong><u>Roll‑off services</u></strong>: The COL fee increase will be reflected on invoices issued on or after <strong>October 1, 2025</strong>.</li>
                  <li><strong><u>Front‑load services</u></strong>: Invoices may also reflect a corresponding adjustment, where applicable.</li>
                </ul>

                <p style="font-size:16px; line-height:1.6; margin:0 0 12px 0;">
                  Thank you for choosing Southern Sanitation for your waste management needs.
                </p>

                <p style="font-size:16px; line-height:1.6; margin:0 0 20px 0;">
                  Sincerely,<br><strong>Southern Sanitation</strong>
                </p>
              </td>
            </tr>
          </table>
          <!--[if mso]></td></tr></table><![endif]-->
        </td>
      </tr>
    </table>

    <!-- Footer (Outlook-safe, table-based, no margins) -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0;background:#f1f3f4;">
      <tr>
        <td align="center" style="padding:0;Margin:0;background:#f1f3f4;">
          <!--[if mso]>
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="background:#f1f3f4;">
          <![endif]-->

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="border-collapse:collapse;width:100%;max-width:600px;">
            <tr>
              <td align="center" style="background:#f1f3f4;padding:20px 20px 10px 20px;">
                <img src="cid:{SIG_CID}" alt="Signature Logo" width="130"
                     style="display:block;height:auto;border:0;outline:none;text-decoration:none;">
              </td>
            </tr>
            <tr>
              <td align="center" style="background:#f1f3f4;padding:0 20px 10px 20px;font-size:14px;line-height:1.5;color:#333;">
                Address: 1202 Houston St. Ste. 200 Laredo, TX 78040<br>
                Phone: <a href="tel:9567233333" style="color:#1a73e8;text-decoration:underline;">(956) 723-3333</a><br>
                Office Hours: Monday - Friday, 8 AM - 5 PM
              </td>
            </tr>
            <tr>
              <td align="center" style="background:#f1f3f4;padding:0 20px 10px 20px;font-size:12px;line-height:1.5;color:#555;">
                Disclaimer: This email is intended for the person or entity to which it is addressed
                and may contain confidential information. If you have received this email in error,
                please notify the sender immediately and delete it from your system.
              </td>
            </tr>
            <tr>
              <td align="center" style="background:#f1f3f4;padding:0 20px 20px 20px;font-size:13px;line-height:1.5;color:#333;">
                If you no longer wish to receive these emails, please email us at
                <a href="mailto:unsubscribe@southernsanitation.com" style="color:#1a73e8;text-decoration:underline;">unsubscribe@southernsanitation.com</a>.
              </td>
            </tr>
          </table>

          <!--[if mso]>
            </td></tr>
          </table>
          <![endif]-->
        </td>
      </tr>
    </table>

  </body>
</html>
"""

# ─── EMAIL SENDER ───────────────────────────────────────────────────────────
def send_email(to_addr: str) -> None:
    # Use 'related' so inline images (CID) work
    msg = MIMEMultipart('related')
    msg['Subject'] = SUBJECT
    msg['From'] = FROM_EMAIL
    msg['To'] = to_addr
    msg['List-Unsubscribe'] = '<mailto:unsubscribe@southernsanitation.com?subject=Unsubscribe>'

    # Alternative part: plain + HTML
    alt = MIMEMultipart('alternative')
    alt.attach(MIMEText(build_plain(), 'plain', 'utf-8'))
    alt.attach(MIMEText(build_html(),  'html',  'utf-8'))
    msg.attach(alt)

    # Embed banner (CID)
    with open(BANNER_FILE, 'rb') as f:
        banner_data = f.read()
    banner_img = MIMEImage(banner_data, _subtype='png')
    banner_img.add_header('Content-ID', f'<{BANNER_CID}>')
    banner_img.add_header('Content-Disposition', 'inline', filename=os.path.basename(BANNER_FILE))
    msg.attach(banner_img)

    # Embed signature (CID)
    with open(SIG_FILE, 'rb') as f:
        sig_data = f.read()
    sig_img = MIMEImage(sig_data, _subtype='png')
    sig_img.add_header('Content-ID', f'<{SIG_CID}>')
    sig_img.add_header('Content-Disposition', 'inline', filename=os.path.basename(SIG_FILE))
    msg.attach(sig_img)

    # Send via SES
    response = ses.send_raw_email(
        Source=FROM_EMAIL.split('<')[-1].rstrip('>') if '<' in FROM_EMAIL else FROM_EMAIL,
        Destinations=[to_addr],
        RawMessage={'Data': msg.as_string()}
    )
    print(f"Sent to {to_addr}: {response.get('MessageId')}")

# ─── MAIN: read CSV & send ──────────────────────────────────────────────────
def load_recipients(csv_path: str):
    recipients = []
    with open(csv_path, 'r', newline='', encoding='utf-8-sig') as f:
        reader = csv.reader(f)
        for row in reader:
            if not row:
                continue
            email_str = (row[0] or "").strip()
            if not email_str:
                continue
            # Skip header-like first cell
            if email_str.lower() in {"email", "emails", "recipient"}:
                continue
            # Remove control chars
            email_str = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', email_str)
            if email_str:
                recipients.append(email_str)
    return recipients

if __name__ == "__main__":
    # Basic file existence checks (optional but helpful)
    for p in (CSV_PATH, BANNER_FILE, SIG_FILE):
        if not os.path.exists(p):
            raise FileNotFoundError(f"Path not found: {p}")

    recipient_list = load_recipients(CSV_PATH)
    print("Recipients loaded:", recipient_list)

    for recipient in recipient_list:
        try:
            send_email(recipient)
            time.sleep(0.1)  # gentle throttle
        except Exception as e:
            print(f"Error sending to {recipient}: {e}")
