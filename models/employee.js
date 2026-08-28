const mongoose = require (`mongoose`);

const employeeSchema = new mongoose.Schema(
    {
        name:{
            type: String,
            required: true,
        },

        email:{
            type: String,
            required: true,
            trim: true,
            unique: true,
            lowercase: true,
        },

        phone:{
            type: String,
            required: true,
        },

        jobTitle:{
            type: String,
            required: true,
        },

        department:{
            type: String,
            required: true,
        },

        birthDate:{
            type: Date,
            required: true,
        },

        status:{
            type: String,
            enum: ["active","inactive"],
            default: "active",
        },

        imageUrl: String,

        imagePublicId: String,
},
        {
            timestamps: true,
        }
);

const Employee = mongoose.model("Employee", employeeSchema)

module.exports = Employee;