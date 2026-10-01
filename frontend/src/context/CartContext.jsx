import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";

import {
  getCartAfterPaymentVerification,
  getCartMetrics,
} from "../utils/cartCalculations";

const CartContext = createContext(null);

const asPositiveNumber = (value, fallback = 0) => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
};

const normaliseCartItem = (item) => {
  const cropId = item?.cropId || item?._id || item?.id;

  if (!cropId) {
    return null;
  }

  const stockQuantity = Number(item.stockQuantity);

  return {
    cropId: String(cropId),
    name: item.name || "Farm-fresh produce",
    price: Math.max(0, Number(item.price) || 0),
    unit: item.unit || "unit",
    imageUrl: item.imageUrl || item.images?.[0]?.url || "",
    quantity: asPositiveNumber(item.quantity, 1),
    ...(Number.isFinite(stockQuantity) && stockQuantity >= 0 ? { stockQuantity } : {}),
  };
};

const readStoredCart = (storageKey) => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const storedValue = window.localStorage.getItem(storageKey);
    if (!storedValue) {
      return [];
    }

    const parsedValue = JSON.parse(storedValue);
    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue.map(normaliseCartItem).filter(Boolean);
  } catch (error) {
    console.error("Failed to parse cart from localStorage:", error);
    return [];
  }
};

export function CartProvider({ children }) {
  const { user } = useAuth();
  const scope = user?.id ? `${user.role}:${user.id}` : "guest";
  // Remount cart state synchronously on account changes, before rendering children.
  // Never import the legacy shared cart: its owner cannot be established safely.
  return <ScopedCartProvider key={scope} storageKey={`agrosphere-cart:${scope}`}>{children}</ScopedCartProvider>;
}

function ScopedCartProvider({ children, storageKey }) {
  const [items, setItems] = useState(() => readStoredCart(storageKey));

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(items));
    } catch {
      // Storage may be blocked or full; keep the current in-memory cart usable.
    }
  }, [items, storageKey]);

  const addToCart = (crop, quantity = 1) => {
    const nextItem = normaliseCartItem({ ...crop, quantity });

    if (!nextItem) {
      return;
    }

    setItems((currentItems) => {
      const existingItem = currentItems.find((item) => item.cropId === nextItem.cropId);

      if (existingItem) {
        return currentItems.map((item) =>
          item.cropId === nextItem.cropId
            ? {
                ...item,
                ...nextItem,
                quantity: Math.min(
                  item.quantity + nextItem.quantity,
                  Number.isFinite(nextItem.stockQuantity)
                    ? nextItem.stockQuantity
                    : Number.POSITIVE_INFINITY
                ),
              }
            : item
        );
      }

      return [...currentItems, nextItem];
    });

  };

  const updateQuantity = (cropId, quantity) => {
    setItems((currentItems) => {
      return currentItems.map((item) => {
        if (item.cropId !== cropId) {
          return item;
        }

        const maximumQuantity = Number.isFinite(item.stockQuantity)
          ? item.stockQuantity
          : Number.POSITIVE_INFINITY;

        return {
          ...item,
          quantity: Math.max(
            1,
            Math.min(asPositiveNumber(quantity, 1), maximumQuantity)
          ),
        };
      });
    });
  };

  const removeFromCart = (cropId) => {
    setItems((currentItems) => currentItems.filter((item) => item.cropId !== cropId));
  };

  const clearCart = () => {
    setItems([]);
  };

  const removePurchasedItems = (cropIds, verification) => {
    setItems((currentItems) =>
      getCartAfterPaymentVerification(currentItems, cropIds, verification)
    );
  };

  const { uniqueItemCount, totalQuantity, subtotal } = getCartMetrics(items);

  return (
    <CartContext.Provider
      value={{
        items,
        uniqueItemCount,
        totalQuantity,
        subtotal,
        addToCart,
        updateQuantity,
        removeFromCart,
        clearCart,
        removePurchasedItems,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used inside a CartProvider");
  }

  return context;
}
