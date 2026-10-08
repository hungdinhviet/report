/**
 * DINHVIETHUNG - AUTH BACKEND
 *
 * CÁCH DÙNG:
 * 1. Tạo một Google Sheet mới.
 * 2. Extensions -> Apps Script.
 * 3. Dán toàn bộ code này vào Code.gs.
 * 4. Sửa ADMIN_EMAIL nếu cần.
 * 5. Chạy setup() một lần và cấp quyền.
 * 6. Deploy -> New deployment -> Web app.
 *    Execute as: Me
 *    Who has access: Anyone
 * 7. Lấy Web App URL dán vào login.html và dashboard/package.
 */

const ADMIN_EMAIL = "hung.dinhviet1997@gmail.com";
const OTP_MINUTES = 5;
const SESSION_DAYS = 7;
const OTP_RESEND_SECONDS = 60;

const SHEET_NAME = "USERS";
const HEADERS = [
  "email",
  "status",
  "otpHash",
  "otpExpires",
  "lastOtpSent",
  "sessionToken",
  "sessionExpires",
  "requestToken",
  "createdAt",
  "approvedAt"
];

function setup(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);

  if(!sh){
    sh = ss.insertSheet(SHEET_NAME);
  }

  if(sh.getLastRow() === 0){
    sh.appendRow(HEADERS);
  }else{
    const current = sh.getRange(1,1,1,Math.max(sh.getLastColumn(),HEADERS.length))
      .getValues()[0];
    HEADERS.forEach((h,i)=>{
      if(current[i] !== h){
        sh.getRange(1,i+1).setValue(h);
      }
    });
  }

  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, HEADERS.length);
}

function doPost(e){
  try{
    const data = JSON.parse(e.postData.contents || "{}");
    const action = String(data.action || "");

    switch(action){
      case "requestOtp":
        return json(requestOtp(data.email));

      case "verifyOtp":
        return json(verifyOtp(data.email, data.otp));

      case "verifySession":
        return json(verifySession(data.token));

      case "logout":
        return json(logout(data.token));

      default:
        return json({ok:false,message:"Action không hợp lệ."});
    }

  }catch(err){
    return json({
      ok:false,
      message:"Lỗi máy chủ: " + err.message
    });
  }
}

function doGet(e){
  try{
    const action = String(e.parameter.action || "");
    const token = String(e.parameter.token || "");

    if(action === "approve"){
      return HtmlService.createHtmlOutput(
        handleAdminDecision(token, "APPROVED")
      );
    }

    if(action === "deny"){
      return HtmlService.createHtmlOutput(
        handleAdminDecision(token, "REJECTED")
      );
    }

    return HtmlService.createHtmlOutput("DINHVIETHUNG AUTH SERVER");
  }catch(err){
    return HtmlService.createHtmlOutput("Lỗi: " + err.message);
  }
}

function requestOtp(email){
  email = normalizeEmail(email);

  if(!isMobiEmail(email)){
    return {
      ok:false,
      message:"Chỉ chấp nhận email có đuôi @mobifone.vn."
    };
  }

  const sh = getSheet();
  const row = findUserRow(sh,email);
  const now = new Date();

  if(row > 0){
    const last = sh.getRange(row,5).getValue();

    if(last instanceof Date &&
       now.getTime() - last.getTime() < OTP_RESEND_SECONDS * 1000){
      return {
        ok:false,
        message:"Bạn vừa yêu cầu OTP. Vui lòng chờ khoảng 60 giây."
      };
    }

    const status = String(sh.getRange(row,2).getValue() || "");

    if(status === "REJECTED"){
      sh.getRange(row,2).setValue("PENDING");
    }
  }

  const otp = String(Math.floor(100000 + Math.random()*900000));
  const otpHash = sha256(otp);
  const expires = new Date(now.getTime() + OTP_MINUTES*60*1000);

  if(row === 0){
    sh.appendRow([
      email,
      "OTP_SENT",
      otpHash,
      expires,
      now,
      "",
      "",
      "",
      now,
      ""
    ]);
  }else{
    sh.getRange(row,2,1,5).setValues([[
      sh.getRange(row,2).getValue() || "OTP_SENT",
      otpHash,
      expires,
      now,
      ""
    ]]);
  }

  GmailApp.sendEmail(
    email,
    "DINHVIETHUNG - Mã OTP đăng ký",
    "Mã OTP của bạn là: " + otp +
    "\n\nMã có hiệu lực trong " + OTP_MINUTES + " phút." +
    "\nNếu bạn không yêu cầu mã này, hãy bỏ qua email."
  );

  return {
    ok:true,
    message:"OTP đã được gửi."
  };
}

function verifyOtp(email, otp){
  email = normalizeEmail(email);
  otp = String(otp || "").trim();

  if(!isMobiEmail(email)){
    return {ok:false,message:"Email không hợp lệ."};
  }

  const sh = getSheet();
  const row = findUserRow(sh,email);

  if(row === 0){
    return {ok:false,message:"Không tìm thấy yêu cầu OTP."};
  }

  const storedHash = String(sh.getRange(row,3).getValue() || "");
  const expires = sh.getRange(row,4).getValue();

  if(!(expires instanceof Date) || expires.getTime() < Date.now()){
    return {ok:false,message:"OTP đã hết hạn. Vui lòng gửi OTP mới."};
  }

  if(sha256(otp) !== storedHash){
    return {ok:false,message:"OTP không đúng."};
  }

  // Xóa OTP sau khi dùng.
  sh.getRange(row,3,1,2).clearContent();

  let status = String(sh.getRange(row,2).getValue() || "");

  // User đã được duyệt -> cấp session.
  if(status === "APPROVED"){
    const session = createSession(sh,row);
    return {
      ok:true,
      status:"APPROVED",
      sessionToken:session
    };
  }

  // User mới -> chuyển PENDING và gửi yêu cầu admin.
  if(status !== "PENDING"){
    status = "PENDING";
    sh.getRange(row,2).setValue(status);
  }

  let requestToken = String(sh.getRange(row,8).getValue() || "");

  if(!requestToken){
    requestToken = Utilities.getUuid();
    sh.getRange(row,8).setValue(requestToken);

    const webAppUrl = ScriptApp.getService().getUrl();
    const approveUrl =
      webAppUrl + "?action=approve&token=" +
      encodeURIComponent(requestToken);
    const denyUrl =
      webAppUrl + "?action=deny&token=" +
      encodeURIComponent(requestToken);

    GmailApp.sendEmail(
      ADMIN_EMAIL,
      "DINHVIETHUNG - Yêu cầu duyệt user",
      "Có user mới cần duyệt:\n\n" +
      "Email: " + email + "\n\n" +
      "DUYỆT:\n" + approveUrl + "\n\n" +
      "TỪ CHỐI:\n" + denyUrl
    );
  }

  return {
    ok:true,
    status:"PENDING",
    message:"Đăng ký thành công. Tài khoản đang chờ quản trị viên duyệt."
  };
}

function verifySession(token){
  token = String(token || "").trim();

  if(!token){
    return {ok:false};
  }

  const sh = getSheet();
  const lastRow = sh.getLastRow();

  if(lastRow < 2){
    return {ok:false};
  }

  const values = sh.getRange(2,1,lastRow-1,HEADERS.length).getValues();

  for(let i=0;i<values.length;i++){
    const row = values[i];

    if(String(row[5] || "") !== token){
      continue;
    }

    const status = String(row[1] || "");
    const expires = row[6];

    if(status !== "APPROVED"){
      return {ok:false};
    }

    if(!(expires instanceof Date) || expires.getTime() < Date.now()){
      return {ok:false};
    }

    return {
      ok:true,
      email:String(row[0] || "")
    };
  }

  return {ok:false};
}

function logout(token){
  token = String(token || "");
  const sh = getSheet();
  const lastRow = sh.getLastRow();

  if(lastRow < 2){
    return {ok:true};
  }

  const values = sh.getRange(2,1,lastRow-1,HEADERS.length).getValues();

  for(let i=0;i<values.length;i++){
    if(String(values[i][5] || "") === token){
      sh.getRange(i+2,6,1,2).clearContent();
      break;
    }
  }

  return {ok:true};
}

function createSession(sh,row){
  const token = Utilities.getUuid() + "-" + Utilities.getUuid();
  const expires = new Date(
    Date.now() + SESSION_DAYS*24*60*60*1000
  );

  sh.getRange(row,6,1,2).setValues([[
    token,
    expires
  ]]);

  return token;
}

function handleAdminDecision(requestToken, decision){
  requestToken = String(requestToken || "");

  const sh = getSheet();
  const lastRow = sh.getLastRow();

  if(lastRow < 2){
    return "<h2>Không tìm thấy yêu cầu.</h2>";
  }

  const values = sh.getRange(2,1,lastRow-1,HEADERS.length).getValues();

  for(let i=0;i<values.length;i++){
    const row = values[i];

    if(String(row[7] || "") !== requestToken){
      continue;
    }

    const sheetRow = i+2;
    const email = String(row[0] || "");
    const currentStatus = String(row[1] || "");

    if(currentStatus === "APPROVED" || currentStatus === "REJECTED"){
      return "<h2>Yêu cầu này đã được xử lý.</h2>";
    }

    sh.getRange(sheetRow,2).setValue(decision);

    if(decision === "APPROVED"){
      sh.getRange(sheetRow,9+1).setValue(new Date());

      GmailApp.sendEmail(
        email,
        "DINHVIETHUNG - Tài khoản đã được duyệt",
        "Tài khoản " + email +
        " đã được quản trị viên duyệt.\n\n" +
        "Bạn có thể quay lại website để đăng nhập."
      );

      return "<h2 style='color:green'>ĐÃ DUYỆT USER</h2><p>" +
        escapeHtml(email) + "</p>";
    }

    GmailApp.sendEmail(
      email,
      "DINHVIETHUNG - Yêu cầu đăng ký bị từ chối",
      "Yêu cầu đăng ký của " + email +
      " chưa được phê duyệt."
    );

    return "<h2>ĐÃ TỪ CHỐI USER</h2><p>" +
      escapeHtml(email) + "</p>";
  }

  return "<h2>Token không hợp lệ.</h2>";
}

function getSheet(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);

  if(!sh){
    setup();
    sh = ss.getSheetByName(SHEET_NAME);
  }

  return sh;
}

function findUserRow(sh,email){
  const lastRow = sh.getLastRow();

  if(lastRow < 2){
    return 0;
  }

  const values = sh.getRange(2,1,lastRow-1,1).getValues();

  for(let i=0;i<values.length;i++){
    if(normalizeEmail(values[i][0]) === email){
      return i+2;
    }
  }

  return 0;
}

function normalizeEmail(email){
  return String(email || "").trim().toLowerCase();
}

function isMobiEmail(email){
  return /^[^@\s]+@mobifone\.vn$/i.test(email);
}

function sha256(value){
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value),
    Utilities.Charset.UTF_8
  );

  return bytes.map(function(b){
    return (b < 0 ? b + 256 : b).toString(16).padStart(2,"0");
  }).join("");
}

function escapeHtml(value){
  return String(value || "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

function json(obj){
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
