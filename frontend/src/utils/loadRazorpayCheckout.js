const RAZORPAY_SCRIPT_ID = "agrosphere-razorpay-checkout";
const RAZORPAY_SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js";

let checkoutScriptPromise;

export function loadRazorpayCheckout() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Payment checkout is only available in a browser."));
  }

  if (window.Razorpay) {
    return Promise.resolve(window.Razorpay);
  }

  if (checkoutScriptPromise) {
    return checkoutScriptPromise;
  }

  checkoutScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(RAZORPAY_SCRIPT_ID);
    const script = existingScript || document.createElement("script");

    const handleLoad = () => {
      if (window.Razorpay) {
        resolve(window.Razorpay);
        return;
      }

      checkoutScriptPromise = undefined;
      reject(new Error("Razorpay Checkout did not become available."));
    };

    const handleError = () => {
      checkoutScriptPromise = undefined;
      script.remove();
      reject(new Error("Razorpay Checkout could not be loaded."));
    };

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });

    if (!existingScript) {
      script.id = RAZORPAY_SCRIPT_ID;
      script.src = RAZORPAY_SCRIPT_URL;
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return checkoutScriptPromise;
}
