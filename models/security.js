const mongoose = require (`mongoose`);

const securitySchema = new mongoose.Schema(
    {
        email:{
            type: String,
            required: true,
            uniqe: true,
            trim: true,
            lowercase: true,
        },

        password:{
            type: String,
            required: true,
            uniqe: true,
        }
    }
);

const Security = mongoose.model("Security", securitySchema)

module.exports = Security;