from enum import StrEnum


class AnalysisStatus(StrEnum):
    REGISTERED = "registered"
    PROCESSING = "processing"
    COMPLETE = "complete"
    FAILED = "failed"


class QualityStatus(StrEnum):
    PENDING = "pending"
    VALID = "valid"
    INVALID = "invalid"


class ContextCategory(StrEnum):
    STRESS = "stress"
    PHYSICAL_ACTIVITY = "physical_activity"
    SLEEP = "sleep"
    ILLNESS = "illness"
    INJURY = "injury"
    COLLECTION_ISSUE = "collection_issue"
    OTHER = "other"


class BodyZone(StrEnum):
    GENERAL = "general"
    HEAD = "head"
    EYES = "eyes"
    CHEST = "chest"
    ABDOMEN = "abdomen"
    BACK = "back"
    ARMS = "arms"
    HANDS = "hands"
    LEGS = "legs"
    FEET = "feet"


class InputMethod(StrEnum):
    VOICE = "voice"
    TEXT = "text"


class RecommendationType(StrEnum):
    COLLECT_SAMPLE = "collect_sample"
    REPEAT_SAMPLE = "repeat_sample"
    REVIEW_PROTOCOL = "review_protocol"
    ONBOARD_MEDICAL_CARE = "onboard_medical_care"


class RecommendationStatus(StrEnum):
    PENDING = "pending"
    COMPLETED = "completed"
    DEFERRED = "deferred"
    ESCALATED = "escalated"
    CANCELLED = "cancelled"


class AlertLevel(StrEnum):
    INFORMATIONAL = "informational"
    FOLLOW_UP = "follow_up"
    PRIORITY = "priority"
    EMERGENCY = "emergency"


class AlertActionStatus(StrEnum):
    PENDING = "pending"
    COMPLETED = "completed"
    DEFERRED = "deferred"
    ESCALATED = "escalated"


class AlertDeliveryStatus(StrEnum):
    LOCAL_ONLY = "local_only"
    PENDING = "pending"
    SENT = "sent"
    CONFIRMED = "confirmed"
    FAILED = "failed"