from database import Base, engine


def run():
    print("Creating KM tables...")
    Base.metadata.create_all(bind=engine)
    print("Done.")

if __name__ == "__main__":
    run()
