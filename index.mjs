import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import https from "https";

const dynamodb = new DynamoDBClient();
const TABLE_NAME = process.env.DYNAMODB_TABLE;
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;
const DOMAIN_NAME = process.env.DOMAIN_NAME;

export const handler = async (event) => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    const message = JSON.parse(record.Sns.Message);
    const { email, firstName, token } = message;

    console.log(`Processing verification for: ${email}`);

    // --- Deduplication check ---
    try {
      const getResult = await dynamodb.send(
        new GetItemCommand({
          TableName: TABLE_NAME,
          Key: { email: { S: email } },
        })
      );

      if (getResult.Item) {
        console.log(`Email already sent to ${email}, skipping duplicate.`);
        continue;
      }
    } catch (error) {
      console.error(`Error checking DynamoDB for ${email}:`, error);
      throw error;
    }

    // --- Send verification email via Mailgun ---
    const verificationLink = `http://${DOMAIN_NAME}/validateEmail?email=${encodeURIComponent(email)}&token=${token}`;

    const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #333;">Welcome to CSYE 6225, ${firstName}!</h2>
      <p>Thank you for creating your account. Please verify your email address by clicking the button below:</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${verificationLink}" style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-size: 16px;">Verify Email</a>
      </p>
      <p style="color: #666; font-size: 14px;">This link will expire in 1 minute.</p>
      <p style="color: #666; font-size: 14px;">If you did not create an account, please ignore this email.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin-top: 30px;">
      <p style="color: #999; font-size: 12px;">CSYE 6225 - Cloud Native Web Application</p>
    </div>`;

    const emailBody = new URLSearchParams({
      from: `noreply@${MAILGUN_DOMAIN}`,
      to: email,
      subject: 'Verify Your Email Address',
      html: htmlContent,
    }).toString();

    try {
      await sendMailgunEmail(emailBody);
      console.log(`Verification email sent to ${email}`);
    } catch (error) {
      console.error(`Failed to send email to ${email}:`, error);
      throw error;
    }

    // --- Record in DynamoDB ---
    try {
      await dynamodb.send(
        new PutItemCommand({
          TableName: TABLE_NAME,
          Item: {
            email: { S: email },
            timestamp: { S: new Date().toISOString() },
            token: { S: token },
          },
        })
      );
      console.log(`Recorded email send for ${email} in DynamoDB`);
    } catch (error) {
      console.error(`Error writing to DynamoDB for ${email}:`, error);
      throw error;
    }
  }

  return { statusCode: 200, body: "Processing complete" };
};

function sendMailgunEmail(body) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`api:${MAILGUN_API_KEY}`).toString("base64");

    const options = {
      hostname: "api.mailgun.net",
      path: `/v3/${MAILGUN_DOMAIN}/messages`,
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log("Mailgun response:", data);
          resolve(data);
        } else {
          reject(new Error(`Mailgun API error: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}