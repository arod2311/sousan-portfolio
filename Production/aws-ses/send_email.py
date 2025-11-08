import boto3
import email.utils
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage

ses = boto3.client('ses', region_name='us-east-1')

# Create the top-level 'related' container
msg = MIMEMultipart('related')
msg['Subject'] = 'Hello with List-Unsubscribe'
msg['From'] = 'Southern Sanitation <info@southernsanitation.com>'
msg['To'] = 'alejandro.rodriguez08@gmail.com'
msg['List-Unsubscribe'] = '<mailto:unsubscribe@southernsanitation.com?subject=Unsubscribe>'

# multipart/alternative for text/plain + text/html
alternative_part = MIMEMultipart('alternative')
msg.attach(alternative_part)

# 1) Plain text (unchanged)
text_part = MIMEText(
    "Hello,\n"
    "Here is our update.\n"
    "To unsubscribe, see List-Unsubscribe in your headers,\n"
    "or email us at unsubscribe@southernsanitation.com.\n\n"
    "Best,\n"
    "Southern Sanitation (bold in HTML)\n"
    "Physical Address: 1202 Houston St. Ste. 200 Laredo, TX 78040\n"
    "Phone: (956) 723-3333\n"
    "Office Hours: Monday - Friday, 8 AM - 5 PM\n\n"
    "Disclaimer: If you no longer wish to receive these emails, please email us at unsubscribe@southernsanitation.com.\n",
    'plain'
)
alternative_part.attach(text_part)

# 2) HTML part, now forcing white background in Dark Mode
html_content = """\
<html>
  <head>
    <meta name="color-scheme" content="only light" />
    <meta name="supported-color-schemes" content="light" />
  </head>
  <body style="margin:0; padding:0; font-family:Arial, sans-serif; color:#333; background-color:#ffffff !important;">

    <!-- Centered Banner at the top (remains centered) -->
    <div style="text-align:center; margin-bottom:20px;">
      <img src="cid:bannerlogo" alt="Banner Logo" style="max-width:600px;">
    </div>

    <!-- Container for everything below, forced centered -->
    <div style="max-width:600px; margin:0 auto; text-align:center;">

      <h1 style="color:#4a4a4a;">
        Hello, Here is our update!
      </h1>

      <p>
        To unsubscribe, click the unsubscribe button in your email client or 
        email us at <a href="mailto:unsubscribe@southernsanitation.com">unsubscribe@southernsanitation.com</a>.
      </p>

      <p>
        Best,<br>
        <b>Southern Sanitation</b>
      </p>

      <!-- Grey box footer with signature, address, phone, hours, disclaimers -->
      <div style="
        background-color:#f1f3f4;
        padding:20px;
        margin:20px auto 40px auto;
        font-size:14px;
        color:#333;
        text-align:center;
      ">

        <!-- Signature image + contact info, all centered -->
        <div style="margin-bottom:15px;">
          <img src="cid:siglogo" alt="Signature Logo" style="max-width:150px; display:block; margin:0 auto;">
        </div>

        <p style="margin:5px 0; line-height:1.5;">
          Physical Address: 1202 Houston St. Ste. 200 Laredo, TX 78040<br>
          Phone: <a href="tel:9567233333">(956) 723-3333</a><br>
          Office Hours: Monday - Friday, 8 AM - 5 PM
        </p>

        <div style="font-size:12px; color:#555; margin-top:15px; line-height:1.5;">
          <p style="margin:0;">
            Disclaimer: This email is intended for the person or entity to which it is addressed
            and may contain confidential information. If you have received this email in error,
            please notify the sender immediately and delete it from your system.
          </p>

          <p style="margin-top:10px;">
            If you no longer wish to receive these emails, please email us at
            <a href="mailto:unsubscribe@southernsanitation.com">unsubscribe@southernsanitation.com</a>.
          </p>
        </div>
      </div> <!-- end grey box -->
    </div> <!-- end center container -->

  </body>
</html>
"""

html_part = MIMEText(html_content, 'html')
alternative_part.attach(html_part)

# Embed banner
with open(r"C:\Users\arodriguez\Documents\Projects\sousan\production\aws-ses\Image\banner_logo_black_letters.png", "rb") as f:
    banner_data = f.read()

mime_banner = MIMEImage(banner_data)
mime_banner.add_header('Content-ID', '<bannerlogo>')
mime_banner.add_header('Content-Disposition', 'inline', filename="banner_logo_black_letters.png")
msg.attach(mime_banner)

# Embed signature image
with open(r"C:\Users\arodriguez\Documents\Projects\sousan\production\aws-ses\Image\sig_logo_black_letters.png", "rb") as f:
    sig_data = f.read()

mime_sig = MIMEImage(sig_data)
mime_sig.add_header('Content-ID', '<siglogo>')
mime_sig.add_header('Content-Disposition', 'inline', filename="sig_logo_black_letters.png")
msg.attach(mime_sig)

# Send
response = ses.send_raw_email(
    Source='info@southernsanitation.com',
    Destinations=['alejandro.rodriguez08@gmail.com'],
    RawMessage={'Data': msg.as_string()}
)

print(response)
