import json, os, boto3
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
from botocore.exceptions import ClientError

ses = boto3.client("ses", region_name="us-east-1")
s3  = boto3.client("s3")

# Raw email practical size limit (~10MB). Keep headroom for MIME boundaries.
MAX_RAW_EMAIL = 9_500_000
ATTACH_HEADROOM = 200_000

BANNER_URL  = os.getenv("BANNER_URL", "")
SIG_URL     = os.getenv("SIG_URL", "")
FAQ_URL     = os.getenv("FAQ_URL", "")
CONTACT_URL = os.getenv("CONTACT_URL", "")
VIDEO_URL   = os.getenv("VIDEO_URL", "")
VIDEO_ANCHOR_URL = os.getenv("VIDEO_ANCHOR_URL") or (FAQ_URL.rstrip("/") + "/#portalvideos")

FROM = 'Southern Sanitation <info@southernsanitation.com>'
SUBJECT_DEFAULT = 'Welcome to Southern Sanitation!'

def vml_button(href, text):
    return f"""\
<!--[if mso]>
  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="{href}" arcsize="8%" stroke="f"
    fillcolor="#01634e" style="height:40px;v-text-anchor:middle;width:280px;">
    <w:anchorlock/>
    <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">
      {text}
    </center>
  </v:roundrect>
<![endif]-->
<!--[if !mso]><!-- -->
  <a href="{href}" style="background:#01634e;color:#fff;text-decoration:none;
     display:inline-block;padding:12px 22px;border-radius:4px;font-weight:bold;">
     {text}
  </a>
<!--<![endif]-->"""

def _as_int(x, default=1):
    try:
        if x is None:
            return default
        s = str(x).strip()
        if s == "":
            return default
        return int(float(s))
    except Exception:
        return default

def normalize_items(items):
    """
    Expand 'quantity' into repeated rows and format frequency.
    Input: [{containerSize, frequency, serviceDays, containerId, quantity?}]
    Output: one dict per physical container.
    """
    out = []
    last_days = ""
    for it in items or []:
        q = max(1, _as_int(it.get("quantity"), 1))
        freq = it.get("frequency", "")
        if isinstance(freq, (int, float)) or (isinstance(freq, str) and str(freq).strip().isdigit()):
            freq_txt = f"{int(float(freq))}x Week"
        else:
            freq_txt = str(freq or "")

        days = (it.get("serviceDays") or it.get("days") or "").strip()
        if not days:
            days = last_days
        if days:
            last_days = days

        base = {
            "containerSize": it.get("containerSize") or it.get("size") or "",
            "frequency":     freq_txt,
            "serviceDays":   days,
            "containerId":   it.get("containerId") or it.get("containerID") or it.get("ContainerID") or ""
        }
        for _ in range(q):
            out.append(base.copy())
    return out

def build_items_table(items):
    if not items:
        return ""
    rows = []
    for it in items:
        rows.append(f"""
          <tr>
            <td style="border:1px solid #ddd;padding:8px;text-align:center;">{it.get('containerSize','')}</td>
            <td style="border:1px solid #ddd;padding:8px;text-align:center;">{it.get('frequency','')}</td>
            <td style="border:1px solid #ddd;padding:8px;text-align:center;">{it.get('serviceDays','')}</td>
            <td style="border:1px solid #ddd;padding:8px;text-align:center;">{it.get('containerId','')}</td>
          </tr>""")
    return f"""\
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="border-collapse:collapse;border:1px solid #ddd;">
  <thead>
    <tr style="background:#f1f3f4;">
      <th style="border:1px solid #ddd;padding:8px;text-align:center;">Container Size</th>
      <th style="border:1px solid #ddd;padding:8px;text-align:center;">Frequency / week</th>
      <th style="border:1px solid #ddd;padding:8px;text-align:center;">Service Days</th>
      <th style="border:1px solid #ddd;padding:8px;text-align:center;">Container ID</th>
    </tr>
  </thead>
  <tbody>
    {''.join(rows)}
  </tbody>
</table>"""

def build_html(name, business_name, items):
    items = normalize_items(items)
    items_html = build_items_table(items)

    if name and business_name:
        greeting = f"<b>{name}</b> ({business_name})"
    elif name:
        greeting = f"<b>{name}</b>"
    else:
        greeting = business_name or "Valued Customer"

    return f"""\
<!doctype html>
<html>
<head>
  <meta name="color-scheme" content="only light"><meta name="supported-color-schemes" content="light">
  <meta http-equiv="x-ua-compatible" content="ie=edge">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#ffffff;color:#333;">
  <center style="width:100%;background:#ffffff;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#01634e;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:100%;">
            <tr>
              <td style="padding:0;">
                <img src="{BANNER_URL}" alt="Southern Sanitation"
                  width="600" style="display:block;border:0;outline:none;text-decoration:none;width:100%;max-width:600px;height:auto;">
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600"
           style="width:600px;max-width:100%;margin:0 auto;">
      <tr><td style="height:20px;line-height:20px;">&nbsp;</td></tr>
      <tr>
        <td style="font-family:Arial,sans-serif;font-size:18px;">Dear {greeting},</td>
      </tr>
      <tr><td style="height:12px;line-height:12px;">&nbsp;</td></tr>
      <tr>
        <td style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6">
          Welcome to <b>Southern Sanitation</b>! Your service agreement is complete and your container(s) have been delivered.
          We're proud that you selected us for your waste management needs.
        </td>
      </tr>

      {"<tr><td style='height:16px;line-height:16px'>&nbsp;</td></tr><tr><td style='font-family:Arial,sans-serif;font-size:16px;font-weight:bold;'>Delivered Items</td></tr><tr><td style='height:8px;line-height:8px'>&nbsp;</td></tr><tr><td>"+items_html+"</td></tr>" if items_html else ""}

      <tr><td style="height:18px;line-height:18px;">&nbsp;</td></tr>
      <tr>
        <td style="font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">Getting started</td>
      </tr>
      <tr>
        <td style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6">
          <ul style="margin:8px 0 12px 20px;padding:0;">
            <li>Please keep the area in front of and above the container clear on your service day.</li>
            <li>Keep the lid closed between services to help control debris, odors, and animals.</li>
            <li>If gate codes, hours, or site access change, let us know so we can update your route.</li>
          </ul>
        </td>
      </tr>

      <tr><td style="height:8px;line-height:8px;">&nbsp;</td></tr>
      <tr>
        <td style="font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">Manage your account online</td>
      </tr>
      <tr>
        <td style="text-align:center;padding:10px 0 16px 0;">
          {vml_button("https://truxportal.southernsanitation.com/", "Open the Customer Portal")}
        </td>
      </tr>

      <tr>
        <td style="text-align:center;padding:6px 0;">
          {vml_button(CONTACT_URL, "Contact Us")}
        </td>
      </tr>
      <tr>
        <td style="text-align:center;padding:6px 0;">
          {vml_button(FAQ_URL, "View FAQs")}
        </td>
      </tr>
      <tr>
        <td style="text-align:center;padding:6px 0;">
          {vml_button(VIDEO_ANCHOR_URL, "Client Web Portal How‑To Videos")}
        </td>
      </tr>

      <tr><td style="height:18px;line-height:18px;">&nbsp;</td></tr>
      <tr>
        <td style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6">
          If you have any questions, reply to this email or call <a href="tel:9567233333">(956) 723‑3333</a>. We’re here to help.
        </td>
      </tr>
      <tr><td style="height:18px;line-height:18px;">&nbsp;</td></tr>
      <tr>
        <td style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6">
          Sincerely,<br><strong>Southern Sanitation</strong>
        </td>
      </tr>
      <tr><td style="height:24px;line-height:24px;">&nbsp;</td></tr>
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f1f3f4;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:100%;">
            <tr><td style="height:16px;line-height:16px;">&nbsp;</td></tr>
            <tr>
              <td align="center">
                <img src="{SIG_URL}" alt="Southern Sanitation" width="130"
                     style="display:block;border:0;outline:none;text-decoration:none;width:130px;height:auto;">
              </td>
            </tr>
            <tr>
              <td style="font-family:Arial,sans-serif;font-size:13px;color:#555;text-align:center;line-height:1.6;padding:8px 20px;">
                Physical Address: 1202 Houston St. Ste. 200 Laredo, TX 78040<br>
                Phone: <a href="tel:9567233333" style="color:#01634e;text-decoration:none;">(956) 723‑3333</a><br>
                Office Hours: Monday – Friday, 8 AM – 5 PM
                <hr style="border:none;border-top:1px solid #ccc;margin:18px 0">
                <small>
                  Disclaimer: This email is intended for the person or entity to which it is addressed and may contain confidential information.
                  If you have received this email in error, please notify the sender immediately and delete it from your system.
                </small>
              </td>
            </tr>
            <tr><td style="height:16px;line-height:16px;">&nbsp;</td></tr>
          </table>
        </td>
      </tr>
    </table>
  </center>
</body>
</html>
"""

def _object_size(bucket, key):
    try:
        r = s3.head_object(Bucket=bucket, Key=key)
        return int(r.get('ContentLength', 0))
    except ClientError as e:
        print("HeadObject failed:", e)
        return 0

def _select_documents(documents):
    docs = documents or []
    slips = [d for d in docs if (d.get('type') or '').lower() == 'serviceslip']
    others = [d for d in docs if (d.get('type') or '').lower() != 'serviceslip']

    budget = MAX_RAW_EMAIL - ATTACH_HEADROOM
    total = 0
    chosen = []

    def consider(group, label):
        nonlocal total, chosen
        for d in group:
            b = d.get('s3Bucket'); k = d.get('s3Key')
            if not b or not k:
                print(f"Skip {label} (missing bucket/key):", d)
                continue
            sz = _object_size(b, k)
            if sz <= 0:
                print(f"Skip {label} (size unknown/zero):", d.get('filename'))
                continue
            if total + sz > budget:
                print(f"Skip {label} (over budget):", d.get('filename'), "size", sz, "total", total)
                continue
            chosen.append((d, sz))
            total += sz

    # Prioritize slip PDFs first, then any other docs (e.g., contract)
    consider(slips, "slip")
    consider(others, "other")

    print("Attachment plan:", [{"name": d.get("filename"), "key": d.get("s3Key"), "size": sz} for d, sz in chosen], "total", total)
    return [d for d, _ in chosen]

def attach_documents(msg, documents):
    selected = _select_documents(documents)
    for d in selected:
        try:
            obj = s3.get_object(Bucket=d['s3Bucket'], Key=d['s3Key'])
            data = obj['Body'].read()
            part = MIMEApplication(data)
            part.add_header('Content-Disposition', 'attachment', filename=d.get('filename','document.pdf'))
            msg.attach(part)
        except ClientError as e:
            print("Attachment fetch failed:", e)

def lambda_handler(event, _ctx):
    if isinstance(event.get("body"), str):
      try:
        body = json.loads(event["body"])
      except Exception:
        body = {}
    else:
      body = event or {}

    evt = (body.get("event") or "").lower()
    if evt != "service-slip-completed":
        return {"statusCode": 200, "body": "Ignored non-completed event"}

    to_addr = body.get("clientEmail") or "info@southernsanitation.com"
    name    = body.get("clientName")  or ""
    bname   = body.get("businessName") or ""
    items   = body.get("items") or []
    cc_list = body.get("ccList") or []
    documents = body.get("documents") or []

    msg = MIMEMultipart("mixed")
    msg["Subject"] = SUBJECT_DEFAULT
    msg["From"]    = FROM
    msg["To"]      = to_addr
    if cc_list:
        msg["Cc"] = ", ".join(cc_list)

    alt = MIMEMultipart("alternative")
    msg.attach(alt)

    if name and bname:
        greeting_plain = f"{name} ({bname})"
    elif name:
        greeting_plain = name
    else:
        greeting_plain = bname or "Valued Customer"
    alt.attach(MIMEText(f"Dear {greeting_plain},\n\nWelcome to Southern Sanitation!", "plain"))

    html = build_html(name, bname, items)
    alt.attach(MIMEText(html, "html"))

    if documents:
        attach_documents(msg, documents)

    ses.send_raw_email(
        Source=FROM,
        Destinations=[to_addr] + cc_list,
        RawMessage={"Data": msg.as_string()}
    )
    return {"statusCode": 200, "body": "Sent"}
