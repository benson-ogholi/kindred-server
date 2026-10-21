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
  service: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Request',
    required: false
  },
  negotiatorService: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Request',
    required: false
  },
  serviceType: {
    type: String,
  },
  negotiatorServiceType: {
    type: String,
    required: false
  },
  isPriceSet: {
    type: Boolean,
    default: false,
  },
  price: {
    type: Number,
    default: 0,
  },
  isPaid:{
    type: Boolean,
    default: false,
  }

}, { timestamps: true });


module.exports = mongoose.model('Negotiation', NegotiationSchema);