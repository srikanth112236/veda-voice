"""Global Pytest Configuration and Test Database Initialization."""

import pytest

import api.app.models  # noqa: F401
import api.app.models.audit  # noqa: F401
import api.app.models.booking  # noqa: F401
import api.app.models.call  # noqa: F401
import api.app.models.compliance  # noqa: F401
import api.app.models.crm  # noqa: F401
import api.app.models.crm_sync  # noqa: F401
import api.app.models.entitlement  # noqa: F401
import api.app.models.industry_pack  # noqa: F401
import api.app.models.knowledge  # noqa: F401
import api.app.models.lead_form  # noqa: F401
import api.app.models.location  # noqa: F401
import api.app.models.outbound  # noqa: F401
import api.app.models.staff  # noqa: F401
import api.app.models.subscription  # noqa: F401
import api.app.models.tenant  # noqa: F401
import api.app.models.user  # noqa: F401
from api.app.db.session import engine
from api.app.models.base import Base


@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    """Ensure all SQLAlchemy tables are created in the active database before tests execute."""
    Base.metadata.create_all(bind=engine)
    yield
