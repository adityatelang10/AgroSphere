MODEL_VERSION = "disease-v1"
RANDOM_SEED = 42
INPUT_SIZE = 160
RESIZE_SIZE = 176
IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]
TRAIN_IMAGES_PER_CLASS = 100
VALIDATION_IMAGES_PER_CLASS = 20
TEST_IMAGES_PER_CLASS = 20

SUPPORTED_CLASSES = [
    {
        "label": "Pepper,_bell___Bacterial_spot",
        "crop": "Bell Pepper",
        "condition": "Bacterial Spot",
        "isHealthy": False,
    },
    {
        "label": "Pepper,_bell___healthy",
        "crop": "Bell Pepper",
        "condition": "Healthy",
        "isHealthy": True,
    },
    {
        "label": "Potato___Early_blight",
        "crop": "Potato",
        "condition": "Early Blight",
        "isHealthy": False,
    },
    {
        "label": "Potato___Late_blight",
        "crop": "Potato",
        "condition": "Late Blight",
        "isHealthy": False,
    },
    {
        "label": "Potato___healthy",
        "crop": "Potato",
        "condition": "Healthy",
        "isHealthy": True,
    },
    {
        "label": "Tomato___Bacterial_spot",
        "crop": "Tomato",
        "condition": "Bacterial Spot",
        "isHealthy": False,
    },
    {
        "label": "Tomato___Early_blight",
        "crop": "Tomato",
        "condition": "Early Blight",
        "isHealthy": False,
    },
    {
        "label": "Tomato___Late_blight",
        "crop": "Tomato",
        "condition": "Late Blight",
        "isHealthy": False,
    },
    {
        "label": "Tomato___Leaf_Mold",
        "crop": "Tomato",
        "condition": "Leaf Mold",
        "isHealthy": False,
    },
    {
        "label": "Tomato___Septoria_leaf_spot",
        "crop": "Tomato",
        "condition": "Septoria Leaf Spot",
        "isHealthy": False,
    },
    {
        "label": "Tomato___Spider_mites Two-spotted_spider_mite",
        "crop": "Tomato",
        "condition": "Two-Spotted Spider Mite",
        "isHealthy": False,
    },
    {
        "label": "Tomato___Target_Spot",
        "crop": "Tomato",
        "condition": "Target Spot",
        "isHealthy": False,
    },
    {
        "label": "Tomato___Tomato_Yellow_Leaf_Curl_Virus",
        "crop": "Tomato",
        "condition": "Yellow Leaf Curl Virus",
        "isHealthy": False,
    },
    {
        "label": "Tomato___Tomato_mosaic_virus",
        "crop": "Tomato",
        "condition": "Mosaic Virus",
        "isHealthy": False,
    },
    {
        "label": "Tomato___healthy",
        "crop": "Tomato",
        "condition": "Healthy",
        "isHealthy": True,
    },
]

CLASS_LABELS = [item["label"] for item in SUPPORTED_CLASSES]
