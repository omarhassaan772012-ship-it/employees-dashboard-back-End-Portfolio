const express = require (`express`);
const mongoose = require (`mongoose`);
const cors = require (`cors`);
const multer = require ("multer");
const bcrypt = require("bcrypt");
const { v2: cloudinary } = require ("cloudinary");
const EmployeeModel = require (`./models/employee`);
const SecurityModel = require (`./models/security`);
const app = express();
const dotenv = require("dotenv");
dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || ".env" });
dotenv.config({ path: "atlas-credentials.env" });
app.use(express.json());
app.use(cors());

if (
  !process.env.CLOUDINARY_CLOUD_NAME ||
  !process.env.CLOUDINARY_API_KEY ||
  !process.env.CLOUDINARY_API_SECRET
) {
  console.warn("Cloudinary is not configured. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET to .env.");
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (file.mimetype.startsWith("image/")) {
      return callback(null, true);
    }

    callback(new Error("يسمح برفع ملفات الصور فقط"));
  },
});

const uploadToCloudinary = (file) => new Promise((resolve, reject) => {
  if (!process.env.CLOUDINARY_API_SECRET) {
    return reject(new Error("إعدادات Cloudinary غير مكتملة. أضف CLOUDINARY_API_SECRET في ملف .env"));
  }

  const stream = cloudinary.uploader.upload_stream(
    { folder: "employees" },
    (error, result) => {
      if (error) {
        return reject(error);
      }

      resolve(result);
    },
  );

  stream.end(file.buffer);
});

const deleteFromCloudinary = async (publicId) => {
  if (publicId) {
    await cloudinary.uploader.destroy(publicId);
  }
};

const PORT = process.env.PORT || process.env.port || 5000;

if (!process.env.MONGODB_URI) {
  throw new Error("Missing MONGODB_URI environment variable");
}

const connectionOptions = {
  serverSelectionTimeoutMS: 10000,
  bufferCommands: false,
};

const employeeConnection = mongoose.createConnection(process.env.MONGODB_URI, {
  ...connectionOptions,
  dbName: "employees",
});
const securityConnection = mongoose.createConnection(
  process.env.MONGODB_URI_SECURITY || process.env.MONGODB_URI,
  { ...connectionOptions, dbName: "security" },
);

employeeConnection.once("open", () => console.log("Employees database connected"));
employeeConnection.on("error", (error) => console.error("Employees database error:", error.message));
securityConnection.once("open", () => console.log("Security database connected"));
securityConnection.on("error", (error) => console.error("Security database error:", error.message));

const Employee = employeeConnection.model("Employee", EmployeeModel.schema);
const Security = securityConnection.model("Security", SecurityModel.schema);

app.use("/api", async (req, res, next) => {
  const connection = req.path.startsWith("/security")
    ? securityConnection
    : employeeConnection;

  try {
    await connection.asPromise();
    next();
  } catch (error) {
    console.error("Database connection error:", error.message);
    res.status(503).json({ message: "Database connection is unavailable" });
  }
});

app.get( "/api/employees", async (req , res) => {
  try{
    const employee = await Employee.find()
    res.status(200).json(employee);
  } catch (error) {
    res.status(400).json({message: error.message});
  }
});

app.post("/api/employees" , upload.single("image"), async (req, res) => {
  try{
    const employeeData = { ...req.body };

    if (req.file) {
      const uploadedImage = await uploadToCloudinary(req.file);
      employeeData.imageUrl = uploadedImage.secure_url;
      employeeData.imagePublicId = uploadedImage.public_id;
    }

    const employee = await Employee.create(employeeData);
    res.status(201).json({employee});
  } catch (error) {
    res.status(400).json({message: error.message});
  }
});


app.post("/api/security" ,async (req, res) => {
  try{
    await securityConnection.asPromise();
    const securityData = {
      ...req.body,
      email: String(req.body.email || "").trim().toLowerCase(),
      password: await bcrypt.hash(String(req.body.password || ""), 12),
    };

    const security = await Security.create(securityData,);
    res.status(201).json({security});
  } catch (error) {
    res.status(400).json({message: error.message});
  }
});

app.post("/api/security/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const security = await Security.findOne({ email });

    const isPasswordValid = security && (
      security.password.startsWith("$2")
        ? await bcrypt.compare(password, security.password)
        : security.password === password
    );

    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!security.password.startsWith("$2")) {
      security.password = await bcrypt.hash(password, 12);
      await security.save();
    }

    res.status(200).json({ security: { _id: security._id, email: security.email } });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.put("/api/security/password", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");

    if (!email || !currentPassword || newPassword.length < 4) {
      return res.status(400).json({ message: "Email, current password, and a new password of at least 4 characters are required" });
    }

    const security = await Security.findOne({ email });
    const isCurrentPasswordValid = security && (
      security.password.startsWith("$2")
        ? await bcrypt.compare(currentPassword, security.password)
        : security.password === currentPassword
    );

    if (!isCurrentPasswordValid) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    security.password = await bcrypt.hash(newPassword, 12);
    await security.save();
    res.status(200).json({ message: "Password changed successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/api/security", async (req, res) => {
  try {
    const security = await Security.find().select("_id email");
    res.status(200).json({ security });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


app.put("/api/security/:id", async (req, res) => {
  try {
    const securityData = { ...req.body };
    if (securityData.email) {
      securityData.email = String(securityData.email).trim().toLowerCase();
    }
    if (securityData.password) {
      securityData.password = await bcrypt.hash(String(securityData.password), 12);
    }

    const security = await Security.findByIdAndUpdate(
      req.params.id,
      securityData,
      { new: true, runValidators: true }
    );

    if (!security) {
      return res.status(404).json({ message: "Security record not found" });
    }

    res.status(200).json({ security });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.delete("/api/security/:id", async (req, res) => {
  try {
    const security = await Security.findByIdAndDelete(
      req.params.id,
    );

    if (!security) {
      return res.status(404).json({ message: "Security record not found" });
    }

    res.status(200).json({ security });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.put("/api/employees/:id" , upload.single("image"), async (req, res) => {
  try{
    const employeeData = { ...req.body };

    if (req.file) {
      const uploadedImage = await uploadToCloudinary(req.file);
      employeeData.imageUrl = uploadedImage.secure_url;
      employeeData.imagePublicId = uploadedImage.public_id;
    }

    const previousEmployee = await Employee.findById(req.params.id);
    if (!previousEmployee) {
      return res.status(404).json({ message: "الموظف غير موجود في قاعدة البيانات" });
    }

    const employee = await Employee.findByIdAndUpdate(
      req.params.id,
      employeeData,
      {new: true}
    );

    if (req.file && previousEmployee.imagePublicId) {
      await deleteFromCloudinary(previousEmployee.imagePublicId);
    }

    res.status(200).json({employee});
  } catch (error) {
    res.status(400).json({message: error.message});
  }
});

app.delete("/api/employees/:id" , async (req, res) => {
  try{
    const employee = await Employee.findByIdAndDelete(
      req.params.id,
    );

    if (!employee) {
      return res.status(404).json({ message: "الموظف غير موجود في قاعدة البيانات" });
    }

    await deleteFromCloudinary(employee.imagePublicId);

    res.status(200).json({message: "تم الحذف بنجاح"});
  } catch (error) {
    res.status(400).json({message: error.message});
  }
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError || error.message === "يسمح برفع ملفات الصور فقط") {
    return res.status(400).json({ message: error.message });
  }

  console.error("API error:", error);
  res.status(500).json({ message: error.message || "حدث خطأ في الخادم" });
});


app.listen( PORT, () => {
  console.log(`Server is ready with port ${PORT}`)

});