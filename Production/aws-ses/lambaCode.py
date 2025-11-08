import json, os, boto3
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

# ─── URLs FROM ENVIRONMENT VARIABLES ───────────────────────────────────────
BANNER_URL  = os.getenv("BANNER_URL")
SIG_URL     = os.getenv("SIG_URL")
FAQ_URL     = os.getenv("FAQ_URL")
CONTACT_URL = os.getenv("CONTACT_URL")
VIDEO_URL   = os.getenv("VIDEO_URL")
VIDEO_ANCHOR_URL = FAQ_URL.rstrip("/") + "/#portalvideos"

ses = boto3.client("ses", region_name="us-east-1")

# ─── HTML BODY BUILDER ─────────────────────────────────────────────────────
def build_html(name, contract_type):
    return f"""\
<html>
<head>
  <meta name="color-scheme" content="only light">
  <meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#ffffff!important;color:#333;">
    <!-- full‑width green banner matching footer width -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="border-collapse:collapse;background:#01634e;">
      <tr>
        <td align="center" style="padding:0;Margin:0;">
          <!-- inner table keeps logo at ~600 px max; scales on mobile -->
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
                 style="border-collapse:collapse;width:100%;max-width:600px;">
            <tr>
              <td style="padding:0;">
                <img src="{BANNER_URL}"
                     alt="Southern Sanitation"
                     style="display:block;border:0;outline:none;text-decoration:none;
                            width:100%;height:auto;line-height:0;">
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    
  <div style="max-width:600px;margin:0 auto;padding:0 15px;">
    <p style="font-size:18px;">Dear <b>{name}</b>,</p>

    <p style="font-size:16px;line-height:1.6">
      Welcome to <b>Southern Sanitation</b>! Your service agreement is now complete and your waste container has been delivered.
      We are proud that you have selected us for your waste management needs.
    </p>

    <p style="font-size:16px; line-height:1.6; margin:0;"><strong>Getting started</strong></p>
                <ul style="font-size:16px; line-height:1.6; padding-left:20px; margin:8px 0 12px 20px;">
                  <li>Please keep the area in front of and above the container clear on your service day.</li>
                  <li>Keep the lid closed between services to help control debris, odors, and animals.</li>
                  <li>If gate codes, hours, or site access change, let us know so we can update your route.</li>
                </ul>

                <p style="font-size:16px; line-height:1.6; margin:12px 0 8px 0;"><strong>Manage your account online</strong></p>
                <p style="font-size:16px; line-height:1.6; margin:0 0 12px 0;">
                  View and pay invoices, set up autopay, and update contact information through our customer portal.
                </p>
                <p style="text-align:left;margin:0 0 16px 0;">
                  <a href="https://truxportal.southernsanitation.com/"
                     style="background:#01634e;color:#fff;padding:12px 20px;text-decoration:none;border-radius:4px;display:inline-block;">
                    Open the Customer Portal
                  </a>
                </p>
                <p style="font-size:16px; line-height:1.6; margin:12px 0 8px 0;"><strong>Some helpful links</strong></p>

    <!-- centred buttons – each on its own row -->
    <div style="text-align:left;margin:25px 0;">
           <a href="{CONTACT_URL}"
               style="background:#01634e;color:#fff;padding:12px 20px;
                      text-decoration:none;border-radius:4px;display:inline-block;">
                Contact Us
            </a> 
        </div>
        <div style="text-align:left;margin:25px 0;">
            <a href="{FAQ_URL}"
               style="background:#01634e;color:#fff;padding:12px 20px;
                      text-decoration:none;border-radius:4px;display:inline-block;">
                View FAQs
            </a>
        </div>
        <div style="text-align:left;margin:25px 0;">
            <a href="{VIDEO_ANCHOR_URL}"
                style="background:#01634e;color:#fff;padding:12px 20px;
                    text-decoration:none;border-radius:4px;display:inline-block;">
            Client Web Portal How‑To Videos
        </a>
    </div>
    </div>
  <div style="max-width:600px;margin:0 auto;padding:0 15px;">
    <p style="font-size:16px;line-height:1.6;margin:0 0 20px 0;">
      If you have any questions at all, reply to this email or give us a call at <a href="tel:9567233333">(956)&nbsp;723‑3333</a>.\nWe’re here to help.
    </p>

    <p style="font-size:16px; line-height:1.6; margin:0 0 20px 0;">
        Sincerely,<br><strong>Southern Sanitation</strong>
    </p>
  </div>

    <div style="background:#f1f3f4;padding:20px;text-align:center">
      <img src="{SIG_URL}" alt="Signature logo" style="max-width:130px;margin-bottom:10px"><br>
      Physical Address: 1202 Houston St.&nbsp;Ste.&nbsp;200&nbsp;Laredo,&nbsp;TX 78040<br>
      Phone: <a href="tel:9567233333">(956) 723‑3333</a><br>
      Office Hours: Monday – Friday, 8 AM – 5 PM
      <hr style="border:none;border-top:1px solid #ccc;margin:18px 0">
      <small style="font-size:12px;color:#555;line-height:1.5">
        Disclaimer: This email is intended for the person or entity to which it is
        addressed and may contain confidential information.
        If you have received this email in error, please notify the sender immediately
        and delete it from your system.
      </small>
      <p style="margin-top:12px;font-size:13px">
        If you no longer wish to receive these emails please
        <a href="mailto:unsubscribe@southernsanitation.com">let us know</a>.
      </p>
    </div>
  </div>
</body>
</html>
"""

def build_plain(name, contract_type):
    return (
        f"Dear {name},\n\n"
        f"Welcome to Southern Sanitation! Your {contract_type} agreement is complete.\n"
        f"Client Web Portal Videos: {VIDEO_ANCHOR_URL}\n"
        f"FAQ: {FAQ_URL}\n"
        f"Contact: {CONTACT_URL}\n\n"
        "Phone: (956) 723‑3333\n"
        "Address: 1202 Houston St. Ste. 200 Laredo, TX 78040\n"
        "Office Hours: Monday – Friday, 8 AM – 5 PM\n"
        "If you no longer wish to receive these emails please let us know at unsubscribe@southernsanitation.com\n"
    )

def send_email(to_addr, name, contract_type):
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Welcome to Southern Sanitation! - Test Email"
    msg["From"]    = "Southern Sanitation <info@southernsanitation.com>"
    msg["To"]      = to_addr
    msg["List-Unsubscribe"] = "<mailto:unsubscribe@southernsanitation.com?subject=Unsubscribe>"

    msg.attach(MIMEText(build_plain(name, contract_type), "plain"))
    msg.attach(MIMEText(build_html(name, contract_type), "html"))

    ses.send_raw_email(
        Source="info@southernsanitation.com",
        Destinations=[to_addr],
        RawMessage={"Data": msg.as_string()}
    )

# ─── Lambda entry point ───────────────────────────────────────────────────
def lambda_handler(event, _ctx):
    body = json.loads(event.get("body", "{}")) if isinstance(event.get("body"), str) else event

    if body.get("event") != "envelope-completed":
        return {"statusCode": 200, "body": "Ignored non-completed event"}

    signer = body["data"]["recipients"]["signers"][0]
    email  = signer["email"]
    name   = signer.get("name", "Valued Customer")

    contract_type = "Service Contract"
    for cf in body["data"].get("customFields", {}).get("textCustomFields", []):
        if cf.get("name") == "ContractType":
            contract_type = cf.get("value")
            break

    send_email(email, name, contract_type)
    return {"statusCode": 200, "body": "Sent"}
