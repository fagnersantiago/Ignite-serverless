const chromium = require("chrome-aws-lambda");
import * as path from "path";
import * as fs from "fs";
import * as handlebars from "handlebars";
import { document } from "../utils/dynamoDbClient";
import { S3 } from "aws-sdk";

interface ICreateCertificate {
  id: string;
  name: string;
  grade: string;
}

interface ITemplate {
  id: string;
  name: string;
  grade: string;
  date: string;
  medal: string;
}

//
// compila handlebrs
const compile = async function (data: ITemplate) {
  //procsess.cwd pega o diretório da aplicação
  const filePath = path.join(
    process.cwd(),
    "src",
    "templates",
    "certificate.hbs"
  );
  //ler o arquivo e converte para utf-8
  const html = fs.readFileSync(filePath, "utf-8");
  return handlebars.compile(html)(data);
};

export const handle = async (event) => {
  const { id, name, grade } = JSON.parse(event.body) as ICreateCertificate;

  const response = await document
    .query({
      TableName: "users_certificates",
      KeyConditionExpression: "id = :id",
      ExpressionAttributeValues: {
        ":id": id,
      },
    })
    .promise();

  const userAlreadyExists = response.Items[0];

  if (!userAlreadyExists) {
    //insere certificadoS
    await document
      .put({
        TableName: "users_certificates",
        Item: {
          id,
          name,
          grade,
        },
      })
      .promise();
  }

  const medalPath = path.join(process.cwd(), "src", "templates", "selo.png");
  const medal = fs.readFileSync(medalPath, "base64");
  const data: ITemplate = {
    id,
    name,
    grade,
    date: new Intl.DateTimeFormat("pt-br").format(new Date()),
    medal,
  };

  const content = await compile(data);

  //converte para PDF
  const browser = await chromium.puppeteer.launch({
    headless: true,
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: process.env.IS_OFFLINE
      ? "/usr/bin/google-chrome"
      : await chromium.executablePath,
    ignoreHTTPSErrors: true,
  });

  //gera pdf
  const page = await browser.newPage();
  await page.setContent(content);
  const pdf = await page.pdf({
    format: "a4",
    printBackground: true,
    path: process.env.IS_OFFLINE ? "certificate.pdf" : null,
    landscape: true,
    preferCSSPageSize: true,
  });

  await browser.close();

  //Salva no ES3
  const s3 = new S3();

  await s3
    .putObject({
      Bucket: "ignite-certificate",
      Key: `${id}.pdf`,
      Body: pdf,
      ACL: "public-read",
      ContentType: "application/pdf",
    })
    .promise();

  return {
    statusCode: 201,
    body: JSON.stringify({
      message: "Certificate created!",
      url: `https://ignite-certificate.s3.sa-east-1.amazonaws.com/${id}.pdf`,
    }),
    headers: {
      "Content-Type": "application/json",
    },
  };
};
