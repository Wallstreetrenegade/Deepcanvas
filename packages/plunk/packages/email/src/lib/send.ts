interface SendEmailParams {
  to: string;
  from: string;
  subject: string;
  body: string;
}

export async function sendEmail({to, from, subject, body}: SendEmailParams) {
  const apiUrl = process.env.API_URI;
  const res = await fetch(`${apiUrl}/v1/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.PLUNK_API_KEY}`,
    },
    body: JSON.stringify({
      to,
      from,
      subject,
      body,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.log(errorText);
    throw new Error('Failed to send email');
  }
}
