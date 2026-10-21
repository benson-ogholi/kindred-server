// constants/pr/statusCopy.js
//
// Maps each Request.status value to the push notification copy shown when
// a request transitions into that status. Used by:
//   - updateRequestProgress (REST controller)
//   - pr-update-request-progress (socket handler)
//
// Keys must exactly match the `status` enum on the Request model:
//   ["pending", "talking", "assigned", "in_progress", "completed",
//    "cancelled", "expired", "confirmed"]
//
// Any status NOT listed here simply won't trigger a push notification
// (both call sites already guard with `if (copy) { ... }`).

module.exports = {
  assigned: {
    title: "Request Assigned",
    body: "A provider has been assigned to your request.",
  },
  in_progress: {
    title: "On The Way",
    body: "Your request is now in progress.",
  },
  completed: {
    title: "Marked Completed",
    body: "The provider has marked this request as completed. Please confirm the handover.",
  },
  cancelled: {
    title: "Request Cancelled",
    body: "This request has been cancelled.",
  },
  expired: {
    title: "Request Expired",
    body: "This request has expired.",
  },
  confirmed: {
    title: "Ride Confirmed",
    body: "Handover confirmed — this request is now closed.",
  },
};
