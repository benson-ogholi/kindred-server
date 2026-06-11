const mongoose = require('mongoose');

const NegotiationSchema = new mongoose.Schema({
  negotiator: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'PadimanRouteUser', 
    required: true 
  },
  serviceProvider: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'PadimanRouteUser', 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['ride pending', 'ride agreed', 'ride started', 'ride ongoing', 'ride completed', 'ride cancelled'], 
    default: 'ride pending' 
  },
  service: { type: String, required: false }, // Add this
  serviceType: { 
    type: String, 
    enum: ['offer_a_ride', 'deliver_a_parcel'], 
    required: true 
  },
  negotiatorService: { type: String, required: false }, // Add this
  agreedAmount: { type: Number },
  isConfirmed: { type: Boolean, default: false },
  isPaid: { type: Boolean, default: false },
  deliveryDetails: { type: String }
}, { timestamps: true });


module.exports = mongoose.model('Negotiation', NegotiationSchema);