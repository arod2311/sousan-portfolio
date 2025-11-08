import boto3

# Initialize the SES client in your region
ses_client = boto3.client('ses', region_name='us-east-1')

template_name = 'MyGeneralTemplate'

html_content = r"""<html>
  <body style="margin:0; padding:0; font-family:Arial, sans-serif; color:#333;">
    <!-- Centered Banner at the top -->
    <div style="text-align:center; margin-bottom:20px;">
      <img src="https://southernsanitation.com/wp-content/uploads/2025/04/banner_logo_black_letters.png"
           alt="Banner Logo" style="max-width:600px;">
    </div>

    <!-- Main container for everything below, centered -->
    <div style="max-width:600px; margin:0 auto; text-align:center;">

      <h1 style="color:#4a4a4a;">
        {{title}}
      </h1>

      <p>
        {{bodyText}}
      </p>

      <p>
        Best,<br>
        <b>Southern Sanitation</b>
      </p>

      <!-- Grey footer box with signature, address, phone, hours, disclaimers -->
      <div style="background-color:#f1f3f4; padding:20px; margin:20px auto 40px auto;
                  font-size:14px; color:#333; text-align:center;">

        <div style="margin-bottom:15px;">
          <img src="https://southernsanitation.com/wp-content/uploads/2025/04/sig_logo_black_letters.png"
               alt="Signature Logo" style="max-width:150px; display:block; margin:0 auto;">
        </div>

        <p style="margin:5px 0; line-height:1.5;">
          Physical Address: 1202 Houston St. Ste. 200 Laredo, TX 78040<br>
          Phone: <a href="tel:{{phone}}">{{phone}}</a><br>
          Office Hours: {{officeHours}}
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

text_content = (
    "Subject: {{subject}}\n"
    "Hello,\n"
    "Here is our update.\n"
    "To unsubscribe, email unsubscribe@southernsanitation.com.\n\n"
    "Best,\n"
    "Southern Sanitation\n"
    "Address/Phone: see HTML version.\n"
    "Office Hours: see HTML version.\n\n"
    "Disclaimer: If you no longer wish to receive these emails, please email us at unsubscribe@southernsanitation.com.\n"
)

template_data = {
    'TemplateName': template_name,
    'SubjectPart': '{{subject}}',  # we'll fill this in when sending
    'TextPart': text_content,
    'HtmlPart': html_content
}

try:
    response = ses_client.create_template(Template=template_data)
    print("Template created:", response)
except ses_client.exceptions.AlreadyExistsException:
    # If the template already exists, update it
    response = ses_client.update_template(Template=template_data)
    print("Template updated:", response)
