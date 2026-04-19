# Backend Utility Scripts

This directory contains utility scripts for development, testing, and maintenance.

## Directory Structure

### `/migrations/`
Database migration scripts for schema updates and data transformations.
- `migrate_*.py` - Various migration scripts for different features
- `add_*.py` - Scripts to add new columns/tables
- `seed_*.py` - Database seeding scripts
- Run migrations carefully in development environment first

### `/verification/`
Scripts to verify database integrity, API consistency, and system health.
- `verify_*.py` - Verification and validation scripts
- `check_*.py` - System health check scripts
- `inspect_*.py` - Database and schema inspection tools
- `health_check.py` - System health monitoring
- `schema_audit.py` - Schema consistency checker

### `/testing/`
Manual test scripts for specific features or APIs.
- `test_*.py` - Feature-specific test scripts
- Note: Unit tests are in `/tests/` directory

### `/debugging/`
Scripts to reproduce and debug specific issues.
- `repro_*.py`, `reproduce_*.py` - Issue reproduction scripts
- `debug_*.py` - Debugging helper scripts
- Use for troubleshooting production issues

### `/legacy/`
Old utility scripts kept for reference.
- May be outdated; use with caution

## Usage

Run scripts from the backend root directory:
```bash
cd backend
python scripts/migrations/migrate_example.py
```

## Important Notes

- Always backup database before running migration scripts
- Test verification scripts on development environment first
- Legacy scripts may not work with current codebase
- For production migrations, use Alembic instead
